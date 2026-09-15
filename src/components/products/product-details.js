import { formatCurrency, formatDate } from "@/lib/client";
import ProductImage from "../pos/product-image";
import { useData } from "@/hooks/useData";
import { Notice } from "../ui/shared";
export default function ProductDetails({
  id,
  version,
  onEdit,
  onToggle,
  busy,
  onClose,
}) {
  const result = useData(`/products/${id}?v=${version}`);
  const p = result.data;
  return (
    <Notice {...result} retry={result.refresh}>
      {p && (
        <div className="product-details-body">
          <div className="product-details-image">
            <ProductImage src={p.imageUrl} size={64} />
          </div>
          <h2>{p.name}</h2>
          <dl className="product-details-facts">
            <div>
              <dt>Category</dt>
              <dd>{p.categoryId?.name || "Unavailable"}</dd>
            </div>
            <div>
              <dt>Base price</dt>
              <dd>{formatCurrency(p.basePrice)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`badge ${p.active ? "active" : ""}`}>
                  {p.active ? "Active" : "Inactive"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>
                <span
                  className={`badge ${p.available === false ? "product-sold-out" : "active"}`}
                >
                  {p.available === false ? "Sold Out" : "Available"}
                </span>
              </dd>
            </div>
          </dl>
          {["variants", "addons"].map((key) => (
            <section className="product-detail-options" key={key}>
              <h3>{key === "variants" ? "Variants" : "Add-ons"}</h3>
              {p[`${key}Enabled`] && p[key]?.length ? (
                p[key].map((option) => (
                  <div key={option._id}>
                    <span>{option.name}</span>
                    <strong>{formatCurrency(option.price)}</strong>
                  </div>
                ))
              ) : (
                <p>
                  No {key === "variants" ? "variants" : "add-ons"} configured
                </p>
              )}
            </section>
          ))}
          <dl className="product-details-facts">
            <div>
              <dt>Created</dt>
              <dd>{p.createdAt ? formatDate(p.createdAt) : "—"}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{p.updatedAt ? formatDate(p.updatedAt) : "—"}</dd>
            </div>
          </dl>
          <div className="product-details-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => onEdit(p)}
            >
              Edit Product
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => onToggle(p, "available")}
            >
              {busy
                ? "Saving…"
                : p.available === false
                  ? "Mark Available"
                  : "Mark Sold Out"}
            </button>
            <button className="button secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Notice>
  );
}
