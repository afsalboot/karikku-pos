import { useState } from "react";
import { useData } from "@/hooks/useData";
import { formatCurrency, formatDate } from "@/lib/client";
import { paymentLabel } from "@/lib/payments";
import { statusLabel } from "../sales/history-utils";
import RecordPagination from "../ui/record-pagination";
export function CustomerSkeleton() {
  return (
    <div
      className="customer-skeleton"
      aria-label="Loading customer details"
      role="status"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span className="product-skeleton" key={i} />
      ))}
    </div>
  );
}
export default function CustomerDetails({
  id,
  full,
  onFull,
  onSale,
  version = 0,
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const result = useData(
    `/customers/${id}?page=${full ? page : 1}&limit=${full ? limit : 5}&v=${version}`,
  );
  const d = result.data;
  if (result.loading) return <CustomerSkeleton />;
  if (result.error)
    return (
      <div className="product-empty" role="alert">
        <p>{result.error}</p>
        <button className="button secondary" onClick={result.refresh}>
          Retry
        </button>
      </div>
    );
  return (
    d && (
      <div className="customer-details-body">
        <div className="customer-profile">
          <span className="customer-avatar">
            {(d.customer.name || "Customer").charAt(0).toUpperCase()}
          </span>
          <h2>{d.customer.name || "Customer"}</h2>
          <p>{d.customer.phone}</p>
          <span className={`badge ${d.summary.orders > 1 ? "active" : ""}`}>
            {d.summary.orders > 1 ? "Returning" : "New"} Customer
          </span>
        </div>
        <div className="customer-detail-stats">
          {[
            ["Total Spent", formatCurrency(d.summary.totalSpent)],
            ["Orders", d.summary.orders],
            ["Average Order", formatCurrency(d.summary.averageOrder)],
            [
              "Last Purchase",
              d.summary.lastPurchase
                ? formatDate(d.summary.lastPurchase)
                : "No purchases",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p className="customer-metric-note">
          Lifetime totals include paid sales only. Cancelled and refunded sales
          remain in history.
        </p>
        <section className="panel p-4">
          <h3 className="!mt-0">Loyalty &amp; Rewards</h3>
          <div className="customer-detail-stats">
            {[
              ["Loyalty Wallet", formatCurrency(d.customer.loyalty?.walletBalance || 0)],
              ["Stamp Progress", `${d.customer.loyalty?.stampCount || 0} / 5`],
              ["Available Rewards", d.customer.loyalty?.availableStampRewards || 0],
              ["Lifetime Earned", formatCurrency(d.customer.loyalty?.lifetimeEarned || 0)],
              ["Lifetime Redeemed", formatCurrency(d.customer.loyalty?.lifetimeRedeemed || 0)],
              ["Visits", d.customer.loyalty?.visitCount || 0],
            ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section>
        <h3>{full ? "Purchase History" : "Recent Purchases"}</h3>
        <div className="customer-purchases">
          {d.items.map((s) => (
            <button
              type="button"
              className="customer-purchase"
              key={s._id}
              onClick={() => onSale(s._id)}
            >
              <div>
                <strong>{s.invoiceNumber}</strong>
                <small>{formatDate(s.createdAt)}</small>
                <small>
                  {s.items.reduce((n, i) => n + i.quantity, 0)} items ·{" "}
                  {paymentLabel(s.paymentMethod)}
                </small>
              </div>
              <div>
                <strong>{formatCurrency(s.total)}</strong>
                <span
                  className={`badge ${s.status === "COMPLETED" ? "active" : ""}`}
                >
                  {statusLabel(s.status)}
                </span>
              </div>
            </button>
          ))}
        </div>
        {!d.items.length && (
          <p className="customer-metric-note">No purchases found.</p>
        )}
        {full ? (
          <RecordPagination
            data={d}
            page={page}
            setPage={setPage}
            limit={limit}
            setLimit={setLimit}
            label="purchases"
          />
        ) : (
          <button
            className="button secondary customer-full-history"
            onClick={onFull}
          >
            View Full Purchase History
          </button>
        )}
      </div>
    )
  );
}
