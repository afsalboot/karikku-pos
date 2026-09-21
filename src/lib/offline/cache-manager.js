"use client";

import { api } from "@/lib/client";
import { offlineDb } from "./db";

const CATALOG_REFRESH_MS = 60_000;
let activeCatalogSync = null;

const productRecord = (product) => ({
  ...product,
  mongoId: String(product._id),
  categoryId: String(product.categoryId?._id || product.categoryId || ""),
  categoryName: product.categoryId?.name || "",
  categoryActive: product.categoryId?.active !== false,
  syncedAt: new Date().toISOString(),
});

const categoryRecord = (category) => ({
  ...category,
  mongoId: String(category._id),
  syncedAt: new Date().toISOString(),
});

async function syncCatalogInternal({ force = false } = {}) {
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  const metadata = await offlineDb.syncMetadata.get("catalog");
  if (!force && metadata?.lastSyncedAt && Date.now() - Date.parse(metadata.lastSyncedAt) < CATALOG_REFRESH_MS)
    return false;

  const [categories, first] = await Promise.all([
    api("/categories"),
    api("/products?active=true&limit=100&page=1"),
  ]);
  const pages = [first];
  for (let page = 2; page <= first.pages; page += 1)
    pages.push(await api(`/products?active=true&limit=100&page=${page}`));

  const products = pages.flatMap((result) => result.items).map(productRecord);
  const productIds = new Set(products.map((product) => product.mongoId));
  const categoryIds = new Set(categories.map((category) => String(category._id)));
  await offlineDb.transaction("rw", offlineDb.products, offlineDb.categories, offlineDb.syncMetadata, async () => {
    await offlineDb.products.bulkPut(products);
    await offlineDb.categories.bulkPut(categories.map(categoryRecord));
    const [cachedProducts, cachedCategories] = await Promise.all([offlineDb.products.toArray(), offlineDb.categories.toArray()]);
    await Promise.all([
      ...cachedProducts.filter((product) => product.active && !productIds.has(product.mongoId)).map((product) => offlineDb.products.update(product.mongoId, { active: false, available: false })),
      ...cachedCategories.filter((category) => category.active && !categoryIds.has(category.mongoId)).map((category) => offlineDb.categories.update(category.mongoId, { active: false })),
    ]);
    await offlineDb.syncMetadata.put({ entityType: "catalog", lastSyncedAt: new Date().toISOString() });
  });
  return true;
}

export function syncCatalog(options = {}) {
  if (!options.force && activeCatalogSync) return activeCatalogSync;
  const task = syncCatalogInternal(options);
  if (!options.force) {
    activeCatalogSync = task.finally(() => {
      activeCatalogSync = null;
    });
    return activeCatalogSync;
  }
  return task;
}

export async function syncSettings() {
  if (typeof navigator === "undefined" || !navigator.onLine) return null;
  const settings = await api("/settings");
  await offlineDb.settings.put({ key: "shop", value: settings, updatedAt: new Date().toISOString() });
  return settings;
}

export async function syncEssentialOfflineData(options) {
  const [catalog, settings] = await Promise.allSettled([syncCatalog(options), syncSettings()]);
  return { catalog, settings };
}
