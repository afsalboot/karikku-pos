import { paymentLabel } from "@/lib/payments";
import Link from "next/link";
import { ArrowUpRight, ShoppingBasket } from "lucide-react";
import { formatCurrency as currency } from "@/lib/client";

export function DashboardCard({
  title,
  href,
  linkLabel,
  children,
  className = "",
}) {
  return (
    <section className={`dash-card ${className}`}>
      <div className="dash-card-heading">
        <h2>{title}</h2>
        {href && (
          <Link href={href}>
            {linkLabel}
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export function StatCard({
  label,
  value,
  icon: Icon,
  children,
  compact = false,
}) {
  return (
    <article className={`dash-stat ${compact ? "dash-stat-small" : ""}`}>
      <div>
        <span>{label}</span>
        {Icon && <Icon size={18} aria-hidden="true" />}
      </div>
      <strong>{value}</strong>
      {children && <div className="dash-stat-detail">{children}</div>}
    </article>
  );
}
export function DashboardEmpty({ message, sale = false }) {
  return (
    <div className="dash-empty">
      <ShoppingBasket size={25} aria-hidden="true" />
      <p>{message}</p>
      {sale && (
        <>
          <small>Start your first sale to see analytics here.</small>
          <Link href="/pos" className="button secondary">
            New Sale
          </Link>
        </>
      )}
    </div>
  );
}
export function DashboardSkeleton() {
  return (
    <div className="dash-skeleton" role="status" aria-label="Loading dashboard">
      <div className="dash-primary-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dash-skeleton-stat" />
        ))}
      </div>
      <div className="dash-secondary-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dash-skeleton-small" />
        ))}
      </div>
      <div className="dash-overview-grid">
        <div className="dash-skeleton-chart" />
        <div className="dash-skeleton-chart" />
      </div>
      <span className="dash-muted">Loading your shop’s performance…</span>
    </div>
  );
}
export function TopSellingProducts({ products }) {
  const max = products[0]?.quantity || 1;
  return (
    <DashboardCard
      title="Top Selling Products"
      href="/reports"
      linkLabel="View Full Report"
    >
      <div className="dash-ranked-list">
        {products.slice(0, 5).map((product, index) => (
          <div className="dash-product-row" key={product._id}>
            <span className="dash-rank">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="dash-product-copy">
              <strong>{product.name}</strong>
              <small>{product.quantity} sold</small>
              <div className="dash-track">
                <span style={{ width: `${(product.quantity / max) * 100}%` }} />
              </div>
            </div>
            <strong>{currency(product.revenue)}</strong>
          </div>
        ))}
      </div>
      {!products.length && (
        <DashboardEmpty message="No products sold in this period." />
      )}
      <p className="dash-footnote">
        Product revenue is before bill discount and tax.
      </p>
    </DashboardCard>
  );
}
export function RecentSales({ sales }) {
  return (
    <DashboardCard
      title="Recent Sales"
      href="/sales"
      linkLabel="View All Sales"
    >
      <div className="dash-recent-list">
        {sales.map((sale) => (
          <Link
            className="dash-sale-row"
            href={`/sales/${sale._id}`}
            key={sale._id}
          >
            <div className="dash-sale-copy">
              <strong>{sale.invoiceNumber}</strong>
              <span>
                {sale.items
                  .map(
                    (item) =>
                      `${item.productName}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`,
                  )
                  .join(", ")}
              </span>
              <small>
                {new Intl.DateTimeFormat("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(sale.createdAt))}
              </small>
            </div>
            <div className="dash-sale-amount">
              <strong>{currency(sale.total)}</strong>
              <span className="dash-payment-badge">{paymentLabel(sale.paymentMethod)}</span>
            </div>
          </Link>
        ))}
      </div>
      {!sales.length && (
        <DashboardEmpty message="No completed sales in this period." />
      )}
    </DashboardCard>
  );
}
export function ExpenseOverview({ categories, total, today }) {
  return (
    <DashboardCard
      title="Expense Overview"
      href="/expenses"
      linkLabel="View Expenses"
    >
      <p className="dash-muted">
        {today ? "Today's Expenses" : "Period Expenses"}
      </p>
      <strong className="dash-section-value">{currency(total)}</strong>
      {categories.length ? (
        <div className="dash-expense-list">
          {categories.map((category) => (
            <div key={category._id}>
              <div className="dash-value-row">
                <span>{category.name}</span>
                <strong>{currency(category.amount)}</strong>
              </div>
              <div className="dash-track">
                <span
                  style={{
                    width: `${total ? (category.amount / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-muted">No expenses recorded in this period.</p>
      )}
    </DashboardCard>
  );
}
export function DayClosingCard({ day }) {
  const open = day?.status === "OPEN";
  const rows = !day
    ? []
    : open
      ? [
          ["Total Sales", day.totalSales],
          ...["Cash", "UPI", "Card", "Other"].map((method) => [
            `${method} Sales`,
            day.payments.find((payment) => payment._id === method)?.total || 0,
          ]),
          ["Expenses", day.expenses],
          ["Opening Cash", day.openingCash],
          ["Expected Cash", day.expectedCash],
        ]
      : [
          ["Cash Sales", day.cashSales],
          ["Expected Cash", day.expectedCash],
          ["Actual Cash", day.actualCash],
          ["Difference", day.difference],
        ];
  return (
    <DashboardCard title="Day Closing">
      <div className="dash-closing-status">
        <span
          className={`dash-status ${open || !day ? "dash-status-open" : "dash-status-closed"}`}
        >
          {!day ? "Day not opened" : open ? "Day Open" : "Day Closed"}
        </span>
        <small>{day?.businessDate || "Current business day"}</small>
      </div>
      <p className="dash-footnote">
        {open
          ? "Current session · independent of the period filter"
          : day
            ? `Last closing · ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(day.closedAt))}`
            : "Open a business day to begin tracking cash."}
      </p>
      <div className="dash-closing-values">
        {rows.map(([label, value]) => (
          <div className="dash-value-row" key={label}>
            <span>{label}</span>
            <strong>{currency(value ?? 0)}</strong>
          </div>
        ))}
      </div>
      {open && (
        <p className="dash-footnote">
          Expected cash includes opening cash, cash expenses and earlier-session
          cash reversals.
        </p>
      )}
      <Link href="/day-closing" className="button primary dash-closing-button">
        {open ? "Close Day" : day ? "View Closing Summary" : "Open Day"}
      </Link>
    </DashboardCard>
  );
}
