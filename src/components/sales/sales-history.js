"use client";
import Select from "@/components/ui/select";
import DateInput from "@/components/ui/date-input";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  MoreHorizontal,
  RotateCcw,
  SlidersHorizontal,
  Banknote,
  CreditCard,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useData, useDebounce } from "@/hooks/useData";
import { useAuth } from "@/components/layout/app-shell";
import { formatCurrency } from "@/lib/client";
import { businessDate, dateBounds } from "@/lib/dates";
import { PageHeading } from "@/components/ui/shared";
import Modal from "@/components/modal";
import { ReceiptModal } from "./receipt";
import SaleDetails from "./sale-details";
import SaleActions from "./sale-actions";
import { salesRange, saleDate, statusLabel } from "./history-utils";
import { paymentLabel } from "@/lib/payments";
const paymentIcons = {
  Cash: Banknote,
  UPI: Smartphone,
  Card: CreditCard,
  Other: Wallet,
  Split: Wallet,
};
export default function SalesWorkspace() {
  const router = useRouter();
  const { user } = useAuth();
  const [range, setRange] = useState(() => salesRange("today"));
  const [preset, setPreset] = useState("today");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState("");
  const [status, setStatus] = useState("");
  const [cashier, setCashier] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [details, setDetails] = useState(null);
  const [menu, setMenu] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const q = useDebounce(query, 350);
  let dateError = "";
  try {
    dateBounds(range.from, range.to);
    if (!range.from || !range.to) dateError = "Choose both dates";
  } catch (error) {
    dateError = error.message;
  }
  const result = useData(
    dateError
      ? null
      : `/sales?${new URLSearchParams({ ...range, page, limit, q, payment, status, cashier, summary: "true" })}`,
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  function reset() {
    setRange(salesRange("today"));
    setPreset("today");
    setQuery("");
    setPayment("");
    setStatus("");
    setCashier("");
    setPage(1);
  }
  const data = result.data;
  const summary = data?.summary;
  const today = range.from === businessDate() && range.to === businessDate();
  const moneyBy = (method) =>
    summary?.payments.find((row) => row._id === method)?.total || 0;
  function filter(setter, value) {
    setter(value);
    setPage(1);
  }
  function view(sale, action = "") {
    setDetails({ id: sale._id, action });
  }
  const pageCount = Math.max(1, data?.pages || 1);
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter((p) => p > 0 && p <= pageCount)
    .sort((a, b) => a - b);
  return (
    <div className="sales-history">
      <PageHeading
        title="Sales History"
        description="View, search and manage completed transactions."
      >
        <Link className="button primary" href="/pos">
          <Plus size={17} />
          New Sale
        </Link>
      </PageHeading>
      <div className="sales-summary-grid" aria-busy={result.loading}>
        {[
          [
            today ? "Today's Sales" : "Period Sales",
            summary ? formatCurrency(summary.sales) : "—",
          ],
          ["Transactions", data?.total?.toLocaleString("en-IN") ?? "—"],
          ["Average Bill", summary ? formatCurrency(summary.averageBill) : "—"],
        ].map(([label, value]) => (
          <div
            className={
              result.loading
                ? "sales-summary-card sales-skeleton"
                : "sales-summary-card"
            }
            key={label}
          >
            <span>{label}</span>
            <strong>{value}</strong>
            <small>
              {label === "Transactions"
                ? "All matching transactions"
                : "Paid sales in selected filters"}
            </small>
          </div>
        ))}
        <div
          className={`sales-summary-card ${result.loading ? "sales-skeleton" : ""}`}
        >
          <span>Payment Summary</span>
          <div className="sales-payment-summary">
            {[
              ["Cash", moneyBy("Cash")],
              ["UPI", moneyBy("UPI")],
              ["Card / Other", moneyBy("Card") + moneyBy("Other")],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{summary ? formatCurrency(value) : "—"}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
      <section className="sales-history-panel">
        <div className="sales-filters">
          <Select
            aria-label="Date range"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              if (e.target.value !== "custom")
                filter(setRange, salesRange(e.target.value));
            }}
          >
            {[
              ["today", "Today"],
              ["yesterday", "Yesterday"],
              ["7", "Last 7 Days"],
              ["month", "This Month"],
              ["last-month", "Last Month"],
              ["custom", "Custom Range"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <DateInput
            type="date"
            aria-label="From date"
            value={range.from}
            rangeStart={range.from} rangeEnd={range.to} max={range.to || undefined}
            onChange={(e) => {
              setPreset("custom");
              filter(setRange, { ...range, from: e.target.value });
            }}
          />
          <DateInput
            type="date"
            aria-label="To date"
            min={range.from}
            value={range.to}
            rangeStart={range.from} rangeEnd={range.to}
            onChange={(e) => {
              setPreset("custom");
              filter(setRange, { ...range, to: e.target.value });
            }}
          />
          <div className="sales-search">
            <Search size={16} />
            <input
              aria-label="Search sales"
              placeholder="Search invoice, customer or product..."
              value={query}
              onChange={(e) => filter(setQuery, e.target.value)}
            />
          </div>
          <button
            className="sales-filter-toggle"
            aria-expanded={expanded}
            aria-controls="sales-extra-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <SlidersHorizontal size={15} />
            Filters
            {[payment, status, cashier].filter(Boolean).length > 0 &&
              ` (${[payment, status, cashier].filter(Boolean).length})`}
          </button>
          <div
            id="sales-extra-filters"
            className={`sales-extra-filters ${expanded ? "expanded" : ""}`}
          >
            <Select
              aria-label="Payment method"
              value={payment}
              onChange={(e) => filter(setPayment, e.target.value)}
            >
              <option value="">All Payments</option>
              {Object.keys(paymentIcons).map((p) => (
                <option key={p} value={p}>
                  {paymentLabel(p)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Sale status"
              value={status}
              onChange={(e) => filter(setStatus, e.target.value)}
            >
              <option value="">All Statuses</option>
              {["COMPLETED", "CANCELLED", "REFUNDED"].map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Cashier"
              value={cashier}
              onChange={(e) => filter(setCashier, e.target.value)}
            >
              <option value="">All Cashiers</option>
              {data?.cashiers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <button className="sales-reset" onClick={reset}>
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
        {dateError || result.error ? (
          <div role="alert" className="error-panel">
            <p>{dateError || result.error}</p>
            {!dateError && (
              <button className="button secondary" onClick={result.refresh}>
                Try again
              </button>
            )}
          </div>
        ) : result.loading ? (
          <div
            className="sales-table-loading"
            role="status"
            aria-label="Loading sales"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sales-skeleton" />
            ))}
          </div>
        ) : data?.items.length ? (
          <div
            className="sales-table-scroll"
            tabIndex={0}
            aria-label="Sales history table"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Invoice",
                    "Date & Time",
                    "Customer",
                    "Items",
                    "Payment",
                    "Total",
                    "Status",
                    "Actions",
                  ].map((label) => (
                    <th
                      key={label}
                      className={label === "Total" ? "sales-money" : ""}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const Icon = paymentIcons[s.paymentMethod] || Wallet;
                  const count = s.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  );
                  return (
                    <tr key={s._id} onClick={() => view(s)}>
                      <td>
                        <button
                          className="sales-invoice"
                          onClick={(e) => {
                            e.stopPropagation();
                            view(s);
                          }}
                        >
                          {s.invoiceNumber}
                        </button>
                      </td>
                      <td>
                        <span className="block">{saleDate(s.createdAt)}</span>
                        <small>{saleDate(s.createdAt, true)}</small>
                      </td>
                      <td>
                        <span className="sales-customer">
                          {s.customer?.name || "Walk-in"}
                        </span>
                        {s.customer?.phone && (
                          <small className="block">{s.customer.phone}</small>
                        )}
                      </td>
                      <td>
                        {count} {count === 1 ? "item" : "items"}
                      </td>
                      <td>
                        <span className="sales-payment">
                          <Icon size={14} />
                          {paymentLabel(s.paymentMethod)}
                        </span>
                      </td>
                      <td className="sales-money">
                        <strong>{formatCurrency(s.total)}</strong>
                      </td>
                      <td>
                        <span
                          className={`sales-status status-${s.status.toLowerCase()}`}
                        >
                          {statusLabel(s.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="sales-more"
                          aria-label={`Actions for ${s.invoiceNumber}`}
                          aria-haspopup="menu"
                          aria-expanded={menu?.sale._id === s._id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu({
                              sale: s,
                              rect: e.currentTarget.getBoundingClientRect(),
                              trigger: e.currentTarget,
                            });
                          }}
                        >
                          <MoreHorizontal size={20} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sales-empty">
            <h2>No sales found</h2>
            <p>No transactions match the selected filters.</p>
            <div>
              <button className="button secondary" onClick={reset}>
                Clear Filters
              </button>
              <Link href="/pos" className="button primary">
                New Sale
              </Link>
            </div>
          </div>
        )}
        {data && (
          <footer className="sales-pagination">
            <span>
              Showing{" "}
              {data.total ? Math.min((page - 1) * limit + 1, data.total) : 0}–
              {Math.min(page * limit, data.total)} of {data.total} sales
            </span>
            <Select
              aria-label="Sales per page"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </Select>
            <div>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              {pages.map((n, i) => (
                <span key={n}>
                  {i > 0 && n - pages[i - 1] > 1 && (
                    <span className="px-1">…</span>
                  )}
                  <button
                    aria-label={`Page ${n}`}
                    aria-current={page === n ? "page" : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                </span>
              ))}
              <button
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </footer>
        )}
      </section>
      {menu && (
        <SaleActions
          menu={menu}
          onClose={closeMenu}
          onView={view}
          onPrint={setReceipt}
          admin={user.role === "ADMIN"}
          onDuplicate={(sale) => router.push(`/pos?duplicate=${sale._id}`)}
        />
      )}
      {details && (
        <Modal drawer title="Sale Details" onClose={() => setDetails(null)}>
          <SaleDetails
            key={details.id}
            id={details.id}
            embedded
            initialAction={details.action}
            onClose={() => setDetails(null)}
            onUpdated={result.refresh}
          />
        </Modal>
      )}
      {receipt && (
        <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
