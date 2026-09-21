"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { offlineDb } from "@/lib/offline/db";
import { syncCatalog } from "@/lib/offline/cache-manager";

export function useOfflineProducts({ query = "", category = "", page = 1, limit = 40 }) {
  const [state, setState] = useState({ items: [], categories: [], total: 0, ready: false, error: "" });
  const load = useCallback(async () => {
    const [products, categories] = await Promise.all([offlineDb.products.toArray(), offlineDb.categories.toArray()]);
    const normalizedQuery = query.trim().toLowerCase();
    const matching = products
      .filter((product) => product.active && product.categoryActive)
      .filter((product) => !category || (category === "special" ? product.special : product.categoryId === category))
      .filter((product) => !normalizedQuery || `${product.name} ${product.categoryName}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name));
    const categoryMap = new Map(categories.map((item) => [item.mongoId, item]));
    setState({
      items: matching.slice((page - 1) * limit, page * limit).map((product) => ({ ...product, _id: product.mongoId, categoryId: categoryMap.get(product.categoryId) || { _id: product.categoryId, name: product.categoryName, active: product.categoryActive } })),
      categories: categories.map((item) => ({ ...item, _id: item.mongoId })),
      total: matching.length,
      ready: true,
      error: "",
    });
  }, [category, limit, page, query]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      load().catch((error) => active && setState((current) => ({ ...current, ready: true, error: error.message })));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    let active = true;
    syncCatalog().then((changed) => active && changed && load()).catch(() => {});
    return () => { active = false; };
  }, [load]);

  return useMemo(() => ({
    data: state.ready ? { items: state.items, total: state.total, page, pages: Math.ceil(state.total / limit) } : null,
    categories: { data: state.ready ? state.categories : null, error: state.error, loading: !state.ready, refresh: () => syncCatalog({ force: true }).then(load) },
    error: state.error,
    loading: !state.ready,
    refresh: () => syncCatalog({ force: true }).then(load),
  }), [state, page, limit, load]);
}
