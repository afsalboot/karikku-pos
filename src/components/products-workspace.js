"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, MoreHorizontal, RotateCcw, Package } from "lucide-react";
import { toast } from "sonner";
import Modal from "./modal";
import ProductEditor from "./products/product-editor";
import ProductBulkDialog from "./products/product-bulk-dialog";
import ProductDetails from "./products/product-details";
import ProductActions from "./products/product-actions";
import ProductImage from "./pos/product-image";
import { api, formatCurrency } from "@/lib/client";
import { useData, useDebounce } from "@/hooks/useData";
import { PageHeading } from "./ui/shared";
const blank = () => ({
  name: "",
  imageUrl: "",
  categoryId: "",
  basePrice: "",
  active: true,
  available: true,
  special: false,
  variantsEnabled: false,
  addonsEnabled: false,
  variants: [],
  addons: [],
});
const editable = (p) => ({
  ...p,
  categoryId: p.categoryId?._id || p.categoryId || "",
  available: p.available !== false,
});
export default function ProductsWorkspace() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [editor, setEditor] = useState(null);
  const [details, setDetails] = useState(null);
  const [version, setVersion] = useState(0);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState({});
  const [bulkAction, setBulkAction] = useState(null);
  function selectProduct(product, checked) {
    setSelected(current => {
      const next = { ...current };
      if (checked) next[product._id] = product.name;
      else delete next[product._id];
      return next;
    });
  }
  const saveLock = useRef(false);
  const search = useDebounce(query, 350);
  const result = useData(
    `/products?${new URLSearchParams({ page, limit, q: search, active: status, category, available: availability, summary: "true" })}`,
  );
  const categories = useData("/categories");
  const params = useSearchParams();
  const requested = useRef(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    const edit = params.get("edit"),
      add = params.get("add");
    const key = edit || add;
    if (!key || requested.current === key) return;
    requested.current = key;
    if (edit)
      api(`/products/${edit}`)
        .then((p) => setEditor(editable(p)))
        .catch((e) => toast.error(e.message));
    else Promise.resolve().then(() => setEditor(blank()));
  }, [params]);
  function close() {
    setEditor(null);
    if (params.has("edit") || params.has("add"))
      window.history.replaceState(null, "", "/products");
    requested.current = null;
  }
  function refresh() {
    setSelected({});
    setPage(1);
    result.refresh();
    setVersion((v) => v + 1);
  }
  async function toggle(product, field) {
    if (saveLock.current) return;
    saveLock.current = true;
    setBusy(true);
    try {
      await api(`/products/${product._id}`, {
        method: "PATCH",
        body: {
          [field]:
            field === "available"
              ? product.available === false
              : !product.active,
        },
      });
      toast.success(
        field === "available"
          ? "Product availability updated"
          : "Product status updated",
      );
      refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  function edit(p) {
    setDetails(null);
    setEditor(editable(p));
  }
  function duplicate(p) {
    const copy = editable(p);
    delete copy._id;
    copy.name = `${p.name.slice(0, 95)} Copy`;
    for (const key of ["variants", "addons"])
      copy[key] = p[key].map(({ name, price }) => ({
        id: crypto.randomUUID(),
        name,
        price,
      }));
    setEditor(copy);
  }
  function filter(setter, value) {
    setter(value);
    setPage(1);
  }
  function reset() {
    setQuery("");
    setStatus("");
    setCategory("");
    setAvailability("");
    setPage(1);
  }
  const data = result.data;
  const summary = data?.summary;
  const filtered = Boolean(query || status || category || availability);
  const pageCount = Math.max(1, data?.pages || 1);
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((p) => p > 0 && p <= pageCount)
    .sort((a, b) => a - b);
  return (
    <div className="products-workspace">
      <PageHeading
        title="Products"
        description="Manage menu items, pricing and availability."
      >
        <button className="button primary" onClick={() => setEditor(blank())}>
          <Plus size={18} />
          Add Product
        </button>
      </PageHeading>
      <div className="product-summary" aria-label="Product statistics">
        {[
          ["Total Products", "total"],
          ["Active Products", "active"],
          ["Inactive Products", "inactive"],
          ["Categories", "categories"],
        ].map(([label, key]) => (
          <section key={key}>
            <span>{label}</span>
            {result.loading ? (
              <span className="product-skeleton summary-skeleton" />
            ) : (
              <strong>{summary?.[key] ?? "\u2014"}</strong>
            )}
          </section>
        ))}
      </div>
      <section className="products-panel product-management-panel">
        <div className="product-toolbar">
          <div className="product-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search products"
              placeholder="Search products..."
              value={query}
              onChange={(e) => filter(setQuery, e.target.value)}
            />
          </div>
          <select
            aria-label="Product category filter"
            value={category}
            onChange={(e) => filter(setCategory, e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.data?.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Product status"
            value={status}
            onChange={(e) => filter(setStatus, e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          <select
            aria-label="Product availability filter"
            value={availability}
            onChange={(e) => filter(setAvailability, e.target.value)}
          >
            <option value="">All Availability</option>
            <option value="true">Available</option>
            <option value="false">Sold Out</option>
          </select>
          <button className="button secondary" onClick={reset}>
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
        <div className="product-bulk-toolbar">
          <strong>{Object.keys(selected).length} selected</strong>
          <span>Select across pages (up to 500).</span>
          <button className="button secondary" disabled={!Object.keys(selected).length || busy} onClick={() => setBulkAction("update")}>Mass Update</button>
          <button className="button danger" disabled={!Object.keys(selected).length || busy} onClick={() => setBulkAction("delete")}>Mass Delete</button>
          {Object.keys(selected).length > 0 && <button className="text-button" onClick={() => setSelected({})}>Clear selection</button>}
        </div>
        {categories.error && (
          <p className="form-error" role="alert">
            {categories.error}{" "}
            <button className="text-button" onClick={categories.refresh}>
              Retry categories
            </button>
          </p>
        )}
        {result.error ? (
          <div className="product-empty" role="alert">
            <p>{result.error}</p>
            <button className="button secondary" onClick={result.refresh}>
              Retry
            </button>
          </div>
        ) : (
          <div
            className="table-scroll product-table-scroll"
            aria-busy={result.loading}
          >
            <table className="product-management-table">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select all products on this page" disabled={result.loading || !data?.items.length} checked={!!data?.items.length && data.items.every(p => selected[p._id])} onChange={e => {
                    const checked = e.target.checked;
                    setSelected(current => {
                      const next = { ...current };
                      for (const p of data.items) {
                        if (!checked) delete next[p._id];
                        else if (Object.keys(next).length < 500) next[p._id] = p.name;
                      }
                      return next;
                    });
                  }} /></th>
                  {[
                    "Product",
                    "Category",
                    "Price",
                    "Variants",
                    "Availability",
                    "Status",
                    "Actions",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.loading
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} aria-hidden="true">
                        {Array.from({ length: 8 }, (_, j) => (
                          <td key={j}>
                            <span className="product-skeleton" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((p) => (
                      <tr key={p._id}>
                        <td><input type="checkbox" aria-label={`Select ${p.name}`} checked={!!selected[p._id]} disabled={!selected[p._id] && Object.keys(selected).length >= 500} onChange={e => selectProduct(p, e.target.checked)} /></td>
                        <td>
                          <button
                            className="product-name-button"
                            onClick={() => setDetails(p._id)}
                          >
                            <span className="product-management-thumb">
                              <ProductImage src={p.imageUrl} size={25} />
                            </span>
                            <strong>{p.name}{p.special && <small className="badge">Special</small>}</strong>
                          </button>
                        </td>
                        <td>{p.categoryId?.name || "Unavailable"}</td>
                        <td className="product-price">
                          {formatCurrency(p.basePrice)}
                        </td>
                        <td>
                          {p.variantsEnabled
                            ? `${p.variants.length} ${p.variants.length === 1 ? "variant" : "variants"}`
                            : "\u2014"}
                        </td>
                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={p.available !== false}
                            aria-label={`Availability for ${p.name}`}
                            aria-busy={busy}
                            disabled={busy}
                            className={`product-availability ${p.available === false ? "sold-out" : ""}`}
                            onClick={() => toggle(p, "available")}
                          >
                            <span className="product-switch-track">
                              <span />
                            </span>
                            <span>
                              {busy
                                ? "Saving..."
                                : p.available === false
                                  ? "Sold Out"
                                  : "Available"}
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className={`badge ${p.active ? "active" : ""}`}>
                            {p.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="icon-button product-more"
                            aria-label={`Actions for ${p.name}`}
                            aria-haspopup="menu"
                            aria-expanded={menu?.product._id === p._id}
                            disabled={busy}
                            onClick={(e) =>
                              setMenu({
                                product: p,
                                rect: e.currentTarget.getBoundingClientRect(),
                                trigger: e.currentTarget,
                              })
                            }
                          >
                            <MoreHorizontal size={20} />
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
        {!result.loading && !result.error && !data?.items.length && (
          <div className="product-empty">
            <Package size={30} />
            <h3>{filtered ? "No products found" : "No products yet"}</h3>
            <p>
              {filtered
                ? "Try changing your search or filters."
                : "Add your menu items to start taking orders."}
            </p>
            <button
              className="button primary"
              onClick={filtered ? reset : () => setEditor(blank())}
            >
              {filtered ? "Clear Filters" : "+ Add Product"}
            </button>
          </div>
        )}
        <footer className="product-pagination">
          <span>
            {data
              ? `Showing ${data.total && data.items.length ? (page - 1) * limit + 1 : 0}\u2013${Math.min(page * limit, data.total)} of ${data.total} products`
              : "Loading products..."}
          </span>
          <div>
            <select
              aria-label="Products per page"
              value={limit}
              onChange={(e) => filter(setLimit, Number(e.target.value))}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            <button
              className="button secondary"
              disabled={result.loading || page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            {pages.map((p, i) => (
              <span className="product-page-number" key={p}>
                {i > 0 && p > pages[i - 1] + 1 && <span>...</span>}
                <button
                  className={`button ${p === page ? "primary" : "secondary"}`}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                  disabled={result.loading}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              </span>
            ))}
            <button
              className="button secondary"
              disabled={result.loading || page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>
      {bulkAction && <ProductBulkDialog action={bulkAction} selected={selected} categories={categories.data || []} onClose={() => setBulkAction(null)} onSaved={() => { setBulkAction(null); refresh(); }} />}
      {menu && (
        <ProductActions
          menu={menu}
          onClose={closeMenu}
          onView={(p) => setDetails(p._id)}
          onEdit={edit}
          onDuplicate={duplicate}
          onToggle={toggle}
        />
      )}
      {details && (
        <Modal drawer title="Product Details" onClose={() => setDetails(null)}>
          <ProductDetails
            id={details}
            version={version}
            onEdit={edit}
            onToggle={toggle}
            busy={busy}
            onClose={() => setDetails(null)}
          />
        </Modal>
      )}
      {editor && (
        <ProductEditor
          initial={editor}
          categories={categories.data || []}
          categoryError={categories.error}
          reloadCategories={categories.refresh}
          onClose={close}
          onSaved={() => {
            close();
            refresh();
          }}
        />
      )}
    </div>
  );
}
