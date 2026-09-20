"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCurrency as currency, formatDate } from "@/lib/client";
import { reconciliationState } from "@/lib/day-closing";
export const sessionLabel = (d) => {
  const date = new Date(`${d.businessDate}T12:00:00+05:30`);
  const label = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date) : d.businessDate || "Date unavailable";
  return `${label}${d.sessionNumber ? ` · Session #${d.sessionNumber}` : ""}`;
};
export function duration(start, end) {
  const minutes = Math.max(
    0,
    Math.floor((new Date(end) - new Date(start)) / 60000),
  );
  return Number.isFinite(minutes)
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : "Unavailable";
}
export function SessionHeader({ day }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="day-session-meta">
      <b>{sessionLabel(day)}</b>
      <span>
        Opened {formatDate(day.openedAt)} · {day.openedBy?.name || "Unknown"}
      </span>
      <span>Running {duration(day.openedAt, now)}</span>
    </div>
  );
}
export function DifferenceBadge({ day, compact = false }) {
  const state = reconciliationState(day);
  const label = {
    BALANCED: "Balanced",
    SHORT: "Short",
    OVER: "Over",
    NEEDS_REVIEW: "Needs Review",
  }[state];
  const Icon = state === "BALANCED" ? CheckCircle2 : AlertTriangle;
  return (
    <span
      role="status"
      className={`day-status ${state === "NEEDS_REVIEW" ? "over" : state.toLowerCase()}`}
    >
      <Icon size={14} aria-hidden="true" />{" "}
      {compact || state === "NEEDS_REVIEW"
        ? label
        : state === "BALANCED"
          ? "Drawer Balanced · ₹0.00 Difference"
          : `${currency(Math.abs(day.difference))} ${label}`}
    </span>
  );
}
export function NegativeWarning({ day }) {
  return day.expectedCash < 0 ? (
    <div className="error-panel" role="alert">
      <strong>Invalid drawer balance — review required</strong>
      <p>
        Recorded cash out exceeds available drawer cash by{" "}
        {currency(Math.abs(day.expectedCash))}. This is an accounting or
        recording problem, not a physical drawer difference. Review expenses,
        refunds and cash movements. Closing is blocked until corrected.
      </p>
    </div>
  ) : null;
}
export function MoneyRows({ rows }) {
  return (
    <dl className="drawer-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{currency(value ?? 0)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function DrawerSummary({ day }) {
  return (
    <MoneyRows
      rows={[
        ["Opening Float", day.openingCash],
        ["Cash Sales", day.cashSales],
        ["Cash Refunds", day.cashRefunds],
        ["Cash Expenses", day.cashExpenses],
        ["Cash In", day.cashIn],
        ["Cash Out", day.cashOut],
        ["Expected Drawer", day.expectedCash],
      ]}
    />
  );
}
export function SessionMetrics({ day }) {
  return (
    <section className="day-summary-grid">
      {[
        ["Opening Float", day.openingCash],
        ["Cash Sales", day.cashSales],
        [
          "Cash Outflow",
          (day.cashExpenses || 0) + (day.cashRefunds || 0) + (day.cashOut || 0),
        ],
        ["Expected Drawer", day.expectedCash],
        ["Total Sales", day.totalSales],
      ].map(([label, value]) => (
        <article
          key={label}
          className={label === "Expected Drawer" ? "featured" : ""}
        >
          <small>{label}</small>
          <strong>{currency(value)}</strong>
        </article>
      ))}
    </section>
  );
}
export function PaymentSummary({ day }) {
  const methods = [
    ...new Set([
      "Cash",
      "UPI",
      "Card",
      ...(day.paymentBreakdown || []).map((p) => p._id),
    ]),
  ];
  return (
    <section className="panel drawer-payments">
      <header>
        <h2>Payment Summary</h2>
        <span>
          Total Sales{" "}
          <b>
            {day.totalSales == null ? "Not recorded" : currency(day.totalSales)}
          </b>
        </span>
      </header>
      {day.paymentBreakdown ? (
        <MoneyRows
          rows={methods.map((method) => [
            method === "UPI"
              ? "GPay / UPI"
              : method === "Split"
                ? "Legacy split (allocation unavailable)"
                : method,
            day.paymentBreakdown.find((p) => p._id === method)?.total || 0,
          ])}
        />
      ) : (
        <p className="muted">
          Payment breakdown was not saved for this older session.
        </p>
      )}
      <small className="muted">
        Only cash payments contribute to drawer cash.
      </small>
    </section>
  );
}
export function CashMovements({ movements = [] }) {
  return (
    <section className="drawer-activity">
      <h2>Drawer Activity</h2>
      {movements.length ? (
        <ul>
          {movements.map((m) => (
            <li key={m._id}>
              <div>
                <b>
                  {m.type === "IN" ? "Cash In" : "Cash Out"} · {m.category}
                </b>
                <small>
                  {formatDate(m.createdAt)} · {m.createdBy?.name || "Unknown"}
                </small>
                {m.note && <p>{m.note}</p>}
              </div>
              <strong>
                {m.type === "IN" ? "+" : "−"}
                {currency(m.amount)}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No cash movements recorded.</p>
      )}
    </section>
  );
}
