"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useData, useDebounce } from "@/hooks/useData";
import { formatCurrency as currency, formatDate } from "@/lib/client";
import { EmptyState, Pagination } from "@/components/ui/shared";
import Modal from "@/components/modal";
import { denominations } from "@/lib/day-closing";
import {
  sessionLabel,
  duration,
  DrawerSummary,
  MoneyRows,
  DifferenceBadge,
  NegativeWarning,
  PaymentSummary,
  CashMovements,
} from "./day-session-summary";
export default function SessionHistory({ version }) {
  const [page, setPage] = useState(1),
    [filters, setFilters] = useState({
      from: "",
      to: "",
      balance: "",
      search: "",
    }),
    [detail, setDetail] = useState(null);
  const search = useDebounce(filters.search);
  const result = useData(
    `/day-sessions?${new URLSearchParams({ ...filters, search, page: String(page), version: String(version) })}`,
  );
  const items = result.data?.items || [];
  function filter(key, value) {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  }
  return (
    <section className="panel day-history drawer-history">
      <header>
        <div>
          <h2>Recent Sessions</h2>
          <p>Closed drawer reconciliations</p>
        </div>
        <button
          className="button secondary"
          disabled={result.refreshing}
          onClick={result.refresh}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      <div className="day-history-filters">
        <label>
          From
          <input
            type="date"
            aria-label="From date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => filter("from", e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            aria-label="To date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => filter("to", e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={filters.balance}
            onChange={(e) => filter("balance", e.target.value)}
          >
            {[
              ["", "All statuses"],
              ["balanced", "Balanced"],
              ["short", "Short"],
              ["over", "Over"],
              ["review", "Needs Review"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            placeholder="Name, reason, note or session code"
            maxLength={100}
            value={filters.search}
            onChange={(e) => filter("search", e.target.value)}
          />
        </label>
      </div>
      {result.loading ? (
        <p role="status">Loading sessions…</p>
      ) : result.error ? (
        <p className="error-panel" role="alert">
          {result.error}
        </p>
      ) : !items.length ? (
        <EmptyState message="No sessions match these filters" />
      ) : (
        <>
          <div className="table-scroll drawer-history-table">
            <table>
              <thead>
                <tr>
                  {[
                    "Date / Session",
                    "Total Sales",
                    "Expected",
                    "Actual",
                    "Difference",
                    "Status",
                    "Closed By",
                    "Action",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d._id}>
                    <td>{sessionLabel(d)}</td>
                    <td>
                      {d.totalSales == null ? "—" : currency(d.totalSales)}
                    </td>
                    <td>{currency(d.expectedCash)}</td>
                    <td>{currency(d.actualCash)}</td>
                    <td>
                      {d.expectedCash < 0
                        ? "Review required"
                        : currency(d.difference)}
                    </td>
                    <td>
                      <DifferenceBadge day={d} compact />
                    </td>
                    <td>{d.closedBy?.name || "Unknown"}</td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => setDetail(d._id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="drawer-history-cards">
            {items.map((d) => (
              <article key={d._id}>
                <header>
                  <b>{sessionLabel(d)}</b>
                  <DifferenceBadge day={d} compact />
                </header>
                <MoneyRows
                  rows={[
                    ["Total Sales", d.totalSales],
                    ["Expected", d.expectedCash],
                    ["Actual", d.actualCash],
                    ...(d.expectedCash < 0
                      ? []
                      : [["Difference", d.difference]]),
                  ]}
                />
                <footer>
                  <small>Closed by {d.closedBy?.name || "Unknown"}</small>
                  <button
                    className="button secondary"
                    onClick={() => setDetail(d._id)}
                  >
                    View
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
      <Pagination data={result.data} page={page} setPage={setPage} />
      {detail && <SessionDetails id={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
function SessionDetails({ id, onClose }) {
  const result = useData(`/day-sessions?sessionId=${id}`),
    day = result.data;
  return (
    <Modal title="Session Details" onClose={onClose}>
      <div className="modal-body drawer-details">
        {result.loading ? (
          <p role="status">Loading session…</p>
        ) : result.error ? (
          <div className="error-panel">
            <p>{result.error}</p>
            <button className="button secondary" onClick={result.refresh}>
              Try again
            </button>
          </div>
        ) : (
          day && (
            <>
              <h3>Session Information</h3>
              <p>{sessionLabel(day)}</p>
              <dl className="drawer-rows">
                {[
                  ["Session Code", day.sessionCode || "Not recorded"],
                  ["Opened at", formatDate(day.openedAt)],
                  ["Opened by", day.openedBy?.name || "Unknown"],
                  ["Closed at", formatDate(day.closedAt)],
                  ["Closed by", day.closedBy?.name || "Unknown"],
                  ["Duration", duration(day.openedAt, day.closedAt)],
                  ["Opening Source", day.openingSource || "Not recorded"],
                  ["Opening Adjustment", day.openingAdjustmentReason || "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <h3>Drawer Summary</h3>
              <DrawerSummary day={day} />
              <MoneyRows
                rows={[
                  ["Actual Cash", day.actualCash],
                  ["Difference", day.difference],
                ]}
              />
              <DifferenceBadge day={day} />
              <NegativeWarning day={day} />
              <h3>Closing</h3>
              {day.closingFloat == null ? (
                <p className="muted">
                  Closing float and cash removal were not recorded for this
                  older session.
                </p>
              ) : (
                <MoneyRows
                  rows={[
                    ["Cash Removed", day.cashRemovedAtClosing],
                    ["Closing Float", day.closingFloat],
                  ]}
                />
              )}
              <p>Difference Reason: {day.differenceReason || "—"}</p>
              {day.differenceDescription && <p>{day.differenceDescription}</p>}
              <p>Closing Note: {day.closingNote || "—"}</p>
              <h3>Denomination Count</h3>
              {day.denominationBreakdown ? (
                <MoneyRows
                  rows={[
                    ...denominations.map((d) => [
                      `₹${d} × ${day.denominationBreakdown[d] || 0}`,
                      d * (day.denominationBreakdown[d] || 0),
                    ]),
                    ["Coins", day.denominationBreakdown.coins],
                    ["Total Counted", day.denominationCount],
                  ]}
                />
              ) : (
                <p className="muted">
                  {day.sessionNumber
                    ? "Cash was entered manually; denomination details were not recorded."
                    : "Denomination details were not recorded for this older session."}
                </p>
              )}
              <PaymentSummary day={day} />
              <CashMovements movements={day.movements} />
            </>
          )
        )}
      </div>
      <footer className="modal-footer">
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </footer>
    </Modal>
  );
}
