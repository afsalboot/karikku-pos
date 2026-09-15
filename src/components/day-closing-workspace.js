"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  RefreshCw,
  User,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/hooks/useData";
import { api, formatCurrency, formatDate } from "@/lib/client";
import { PageHeading, EmptyState, Pagination } from "@/components/ui/shared";
import { validCash, validSession, cashDifference } from "@/lib/day-closing";
import { cents, money } from "@/lib/calculations";
import Modal from "@/components/modal";
import Link from "next/link";
const reasons = [
  "Counting Error",
  "Cash Expense Not Recorded",
  "Cash Sale Not Recorded",
  "Change / Rounding Difference",
  "Cash Removed From Drawer",
  "Opening Cash Error",
  "Cash Added / External Funding Not Recorded",
  "Expense Paid Outside Drawer",
  "Other",
];
function duration(start, end) {
  const minutes = Math.max(
    0,
    Math.floor((new Date(end) - new Date(start)) / 60000),
  );
  return Number.isFinite(minutes)
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : "Unavailable";
}
function Duration({ day }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span>
      <Clock3 size={15} />
      Session Duration: <b>{duration(day.openedAt, day.closedAt || now)}</b>
    </span>
  );
}
const denoms = [500, 200, 100, 50, 20, 10];
const dateOnly = (value) =>
  !value || !Number.isFinite(Date.parse(`${value}T12:00:00+05:30`)) ? "Unavailable" : new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T12:00:00+05:30`));
const timeOnly = (value) =>
  !value || !Number.isFinite(Date.parse(value)) ? "Unavailable" : new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(value))
    .toUpperCase();
function status(difference, expectedCash) {
  if (expectedCash < 0)
    return {
      label: `${formatCurrency(Math.abs(difference))} ${difference < 0 ? "below" : "above"} recorded balance`,
      className: "over",
      icon: AlertTriangle,
    };
  if (!difference)
    return { label: "Balanced", className: "balanced", icon: CheckCircle2 };
  return difference < 0
    ? {
        label: `${formatCurrency(Math.abs(difference))} Short`,
        className: "short",
        icon: AlertTriangle,
      }
    : {
        label: `${formatCurrency(difference)} Over`,
        className: "over",
        icon: AlertTriangle,
      };
}
export default function DayClosingWorkspace() {
  const lock = useRef(false);
  const [success, setSuccess] = useState(null),
    [error, setError] = useState("");
  const [actual, setActual] = useState(""),
    [reason, setReason] = useState(""),
    [other, setOther] = useState(""),
    [note, setNote] = useState(""),
    [counts, setCounts] = useState({}),
    [countOpen, setCountOpen] = useState(false),
    [confirm, setConfirm] = useState(false),
    [details, setDetails] = useState(null),
    [pending, setPending] = useState(false);
  const result = useData("/day-sessions?limit=1"),
    day = result.data?.current;
  const counted = useMemo(
    () =>
      money(
        denoms.reduce((sum, d) => sum + d * 100 * (Number(counts[d]) || 0), 0) +
          cents(Number(counts.coins) || 0),
      ),
    [counts],
  );
  const diff =
    validSession(day) && validCash(actual)
      ? cashDifference(actual, day.expectedCash)
      : null;
  const discrepancy = diff !== null && Math.abs(diff) > 0.004;
  const validReason =
    !discrepancy || (reason && (reason !== "Other" || other.trim()));
  const canClose =
    validSession(day) && validCash(actual) && validReason && !pending;
  async function close() {
    if (!canClose || lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const closed = await api("/day-sessions", {
        method: "POST",
        body: {
          action: "close",
          sessionId: day._id,
          expectedCash: day.expectedCash,
          actualCash: Number(actual),
          differenceReason: discrepancy
            ? reason === "Other"
              ? other.trim()
              : reason
            : undefined,
          closingNote: note.trim(),
          denominationCount:
            countOpen && validCash(counted) ? counted : undefined,
        },
      });
      setSuccess(closed);
      setConfirm(false);
      setActual("");
      setReason("");
      setOther("");
      setNote("");
      setCounts({});
      setCountOpen(false);
      result.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className="day-closing-workspace">
      <PageHeading
        title="Day Closing"
        description="Reconcile your cash drawer and close the current business session."
      >
        {day && <span className="day-status open">OPEN</span>}
      </PageHeading>
      {result.error ? (
        <div className="error-panel">
          <p>{result.error}</p>
          <button className="button secondary" onClick={result.refresh}>
            Try again
          </button>
        </div>
      ) : result.loading ? (
        <div className="day-loading" />
      ) : (
        <>
          {day ? (
            <>
              <section className="day-session-meta">
                <span>
                  <CalendarDays size={15} />
                  Business Date: <b>{dateOnly(day.businessDate)}</b>
                </span>
                <span>
                  <Clock3 size={15} />
                  Opened: <b>{timeOnly(day.openedAt)}</b>
                </span>
                <span>
                  <User size={15} />
                  Opened By: <b>{day.openedBy?.name || "Unknown"}</b>
                </span>
                <Duration day={day} />
              </section>
              {!validSession(day) && (
                <p className="error-panel" role="alert">
                  Session data is invalid. Refresh before closing.
                </p>
              )}
              <section className="day-summary-grid">
                <Metric label="Opening Cash" value={day.openingCash} />
                <Metric label="Cash Sales" value={day.cashSales} />
                <Metric label="Cash Expenses" value={day.cashExpenses} />
                <Metric
                  label="Expected Cash"
                  value={day.expectedCash}
                  featured
                />
                <Metric label="Total Sales" value={day.totalSales} />
              </section>
              <Payments day={day} />
              <NegativeCashWarning expectedCash={day.expectedCash} review />
              <section className="day-reconcile">
                <article className="panel">
                  <h2>Expected Cash in Drawer</h2>
                  <strong className="day-large-money">
                    {formatCurrency(day.expectedCash)}
                  </strong>
                  <div className="day-calculation">
                    <p>
                      <span>Opening Cash</span>
                      <b>{formatCurrency(day.openingCash)}</b>
                    </p>
                    <p>
                      <span>Cash Sales</span>
                      <b>+ {formatCurrency(day.cashSales)}</b>
                    </p>
                    <p>
                      <span>Cash Expenses</span>
                      <b>− {formatCurrency(day.cashExpenses)}</b>
                    </p>
                    <p>
                      <span>Cash Adjustments / Reversals</span>
                      <b>
                        {day.cashRefunds ? "− " : ""}
                        {formatCurrency(day.cashRefunds || 0)}
                      </b>
                    </p>
                    <p className="total">
                      <span>Expected Cash</span>
                      <b>{formatCurrency(day.expectedCash)}</b>
                    </p>
                  </div>
                  <small className="muted">
                    Opening cash + cash sales − cash expenses ± valid cash
                    adjustments / reversals.
                  </small>
                  <button className="button secondary day-session-refresh" disabled={pending} onClick={() => {setConfirm(false);setError("");result.refresh();}}><RefreshCw size={15}/>Refresh session totals</button>
                </article>
                <article className="panel day-actual">
                  <h2>Actual Cash in Drawer</h2>
                  <label className="actual-input">
                    <span>₹</span>
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      aria-label="Actual Cash in Drawer"
                      inputMode="decimal"
                      placeholder="Enter counted cash"
                      value={actual}
                      aria-describedby="actual-cash-help"
                      aria-invalid={actual !== "" && !validCash(actual)}
                      onChange={(e) => setActual(e.target.value)}
                    />
                  </label>
                  <small id="actual-cash-help" className="muted">
                    Enter the notes and coins physically in the drawer. Use 0 if
                    empty; actual cash cannot be negative.
                  </small>
                  {actual !== "" && !validCash(actual) && (
                    <p className="error-panel" role="alert">
                      Enter cash from 0 to 1,000,000 with at most two decimal places.
                    </p>
                  )}
                  {diff !== null && <Difference difference={diff} expectedCash={day.expectedCash} />}
                  <label className="day-note">
                    <span>
                      Closing Note <small>Optional</small>
                    </span>
                    <textarea
                      value={note}
                      maxLength="500"
                      placeholder="Optional note about this session..."
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  {discrepancy && (
                    <div className="difference-reason">
                      <label>
                        <span>Reason for Difference *</span>
                        <select
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        >
                          <option value="">Select a reason</option>
                          {reasons.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                      {reason === "Other" && (
                        <input
                          placeholder="Describe the difference"
                          aria-label="Describe the difference"
                          value={other}
                          maxLength="80"
                          onChange={(e) => setOther(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                  <button
                    aria-expanded={countOpen}
                    aria-controls="cash-denominations"
                    className="denom-toggle"
                    onClick={() => setCountOpen(!countOpen)}
                  >
                    <Banknote size={16} />
                    Count by Denomination
                    <ChevronDown size={16} />
                  </button>
                  {countOpen && (
                    <div className="denominations" id="cash-denominations">
                      {denoms.map((d) => (
                        <label key={d}>
                          <span>₹{d}</span>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={counts[d] || ""}
                            aria-label={`Quantity of ₹${d} notes`}
                            onChange={(e) => {
                              if (
                                e.target.value === "" ||
                                (/^\d+$/.test(e.target.value) &&
                                  Number(e.target.value) <= 100000)
                              )
                                setCounts({ ...counts, [d]: e.target.value });
                            }}
                          />
                          <b>{formatCurrency(d * (Number(counts[d]) || 0))}</b>
                        </label>
                      ))}
                      <label>
                        <span>Coins</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={counts.coins || ""}
                          aria-label="Total value of coins"
                          onChange={(e) => {
                            if (
                              e.target.value === "" ||
                              validCash(e.target.value)
                            )
                              setCounts({ ...counts, coins: e.target.value });
                          }}
                        />
                        <b>{formatCurrency(Number(counts.coins) || 0)}</b>
                      </label>
                      <p>
                        Total Counted Cash{" "}
                        <strong>{formatCurrency(counted)}</strong>
                      </p>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={!validCash(counted)}
                        onClick={() => setActual(counted.toFixed(2))}
                      >
                        Use {formatCurrency(counted)} as Actual Cash
                      </button>
                    </div>
                  )}
                  <button
                    className="button primary day-close-button"
                    disabled={!canClose}
                    onClick={() => setConfirm(true)}
                  >
                    {pending ? "Closing..." : "Close Day"}
                  </button>
                </article>
              </section>
            </>
          ) : (
            <OpenDay
              pending={pending}
              onOpen={async (value) => {
                if (lock.current) return;
                lock.current = true;
                setPending(true);
                try {
                  await api("/day-sessions", {
                    method: "POST",
                    body: { action: "open", openingCash: value },
                  });
                  toast.success("Business day opened");
                  result.refresh();
                } catch (e) {
                  toast.error(e.message);
                } finally {
                  lock.current = false;
                  setPending(false);
                }
              }}
            />
          )}
        </>
      )}
      <History version={success?._id || day?._id || ""} onView={setDetails} />
      {success && (
        <Modal title="Day Closed Successfully" onClose={() => setSuccess(null)}>
          <div className="modal-body day-confirm">
            <p>
              Expected Cash <b>{formatCurrency(success.expectedCash)}</b>
            </p>
            <p>
              Actual Cash <b>{formatCurrency(success.actualCash)}</b>
            </p>
            <NegativeCashWarning expectedCash={success.expectedCash} />
            <Difference difference={success.difference} expectedCash={success.expectedCash} />
            <p>
              Closed by <b>{success.closedBy?.name || "Unknown"}</b>
            </p>
            <p>
              Closed at <b>{formatDate(success.closedAt)}</b>
            </p>
          </div>
          <footer className="modal-footer">
            <button className="button primary" onClick={() => setSuccess(null)}>
              Done
            </button>
          </footer>
        </Modal>
      )}
      {confirm && day && (
        <CloseConfirm
          error={error}
          day={day}
          actual={Number(actual)}
          difference={diff}
          reason={discrepancy ? (reason === "Other" ? other : reason) : ""}
          pending={pending}
          onClose={() => setConfirm(false)}
          onConfirm={close}
        />
      )}{" "}
      {details && (
        <SessionDetails day={details} onClose={() => setDetails(null)} />
      )}
    </div>
  );
}
function Metric({ label, value, featured }) {
  return (
    <article className={featured ? "featured" : ""}>
      <small>{label}</small>
      <strong>{formatCurrency(value)}</strong>
      {featured && <em>Drawer cash expected</em>}
    </article>
  );
}
function NegativeCashWarning({ expectedCash, review = false }) {
  if (!(expectedCash < 0)) return null;
  return (
    <div className="error-panel" role="note">
      <strong>Negative expected cash — review the cash records</strong>
      <p>
        Recorded cash out exceeds opening cash and cash sales by {formatCurrency(Math.abs(expectedCash))}.
        This is a gap in the recorded balance, not a physical cash count.
      </p>
      <p>
        Check cash expense amounts and payment methods, opening cash, refunds,
        and any money added or expenses paid outside the drawer. Every expense
        marked Cash currently reduces this drawer balance.
      </p>
      <p>
        {review ? "Correct any incorrect records before closing. If you close with this gap, enter the physical count and explain the source or error in the reason and closing note. " : "This session has a negative recorded balance. Review its saved reason and closing note. "}
        A positive difference against this balance does not prove there is extra cash.
      </p>
      {review && <Link className="button secondary" href="/expenses">Review expenses</Link>}
    </div>
  );
}
function Difference({ difference, expectedCash }) {
  const s = status(difference, expectedCash),
    Icon = s.icon;
  return (
    <div role="status" className={`day-difference ${s.className}`}>
      <Icon size={18} />
      <span>
        <small>
          {expectedCash < 0
            ? "Difference from recorded balance"
            : difference === 0
            ? "Drawer Balanced"
            : difference < 0
              ? "Cash Short"
              : "Cash Over"}
        </small>
        <strong>{difference === 0 ? "₹0.00 Difference" : s.label}</strong>
      </span>
    </div>
  );
}
function OpenDay({ pending, onOpen }) {
  const [cash, setCash] = useState("0");
  return (
    <section className="panel day-open">
      <Wallet size={25} />
      <h2>Start a business day</h2>
      <p>Open the cash drawer session before recording sales or expenses.</p>
      <label>
        Opening cash (₹)
        <input
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          value={cash}
          onChange={(e) => setCash(e.target.value)}
        />
      </label>
      <button
        className="button primary"
        disabled={pending || !validCash(cash)}
        onClick={() => onOpen(Number(cash))}
      >
        {pending ? "Opening..." : "Open Day"}
      </button>
    </section>
  );
}
function History({ version, onView }) {
  const [page, setPage] = useState(1),
    [filters, updateFilters] = useState({
      from: "",
      to: "",
      balance: "",
      search: "",
    });
  const result = useData(
      `/day-sessions?${new URLSearchParams({ ...filters, page: String(page), version })}`,
    ),
    data = result.data,
    items = data?.items || [],
    refresh = result.refresh;
  function setFilters(value) {
    updateFilters(value);
    setPage(1);
  }
  return (
    <section className="panel day-history">
      <header>
        <div>
          <h2>Closed Sessions</h2>
          <p>Previous cash reconciliations</p>
        </div>
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      <div className="day-history-filters">
        <label>
          From
          <input
            aria-label="From date"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            aria-label="To date"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <label>
          Status
          <select
            value={filters.balance}
            onChange={(e) =>
              setFilters({ ...filters, balance: e.target.value })
            }
          >
            <option value="">All statuses</option>
            <option value="balanced">Balanced</option>
            <option value="short">Short</option>
            <option value="over">Over</option>
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            placeholder="Name, reason or note"
            value={filters.search}
            maxLength={100}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
      </div>
      {result.loading ? (
        <p role="status">Loading closed sessions...</p>
      ) : result.error ? (
        <p className="error-panel" role="alert">
          {result.error}
        </p>
      ) : items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Business Date",
                  "Opening Cash",
                  "Cash Sales",
                  "Cash Expenses",
                  "Expected",
                  "Actual",
                  "Difference",
                  "Status",
                  "Closed By",
                  "Closed At",
                  "Action",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((d) => {
                const s = status(d.difference, d.expectedCash);
                return (
                  <tr key={d._id}>
                    <td>{dateOnly(d.businessDate)}</td>
                    <td>{formatCurrency(d.openingCash)}</td>
                    <td>{formatCurrency(d.cashSales)}</td>
                    <td>{formatCurrency(d.cashExpenses)}</td>
                    <td>{formatCurrency(d.expectedCash)}</td>
                    <td>{formatCurrency(d.actualCash)}</td>
                    <td>{s.label}</td>
                    <td>
                      <span className={`day-status ${s.className}`}>
                        {s.label}
                      </span>
                    </td>
                    <td>{d.closedBy?.name || "Unknown"}</td>
                    <td>{timeOnly(d.closedAt)}</td>
                    <td>
                      <button
                        className="button secondary"
                        aria-label="View session"
                        onClick={() => onView(d)}
                      >
                        <Eye size={17} />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          message={
            Object.values(filters).some(Boolean)
              ? "No sessions match these filters"
              : "No closed sessions yet"
          }
        />
      )}
      <Pagination data={data} page={page} setPage={setPage} />
    </section>
  );
}
function CloseConfirm({
  day,
  actual,
  difference,
  reason,
  pending,
  onClose,
  onConfirm,
  error,
}) {
  return (
    <Modal
      closable={!pending}
      title="Close Business Session?"
      description="Once this session is closed, sales and expenses will belong to the next business session."
      onClose={pending ? () => {} : onClose}
    >
      <div className="modal-body day-confirm">
        <p>
          Business Date <b>{dateOnly(day.businessDate)}</b>
        </p>
        {[
          ["Opening Cash", day.openingCash],
          ["Cash Sales", day.cashSales],
          ["Cash Expenses", day.cashExpenses],
          ["Expected Cash", day.expectedCash],
          ["Actual Cash", actual],
        ].map(([l, v]) => (
          <p key={l}>
            <span>{l}</span>
            <b>{formatCurrency(v)}</b>
          </p>
        ))}
        <NegativeCashWarning expectedCash={day.expectedCash} review />
        <Difference difference={difference} expectedCash={day.expectedCash} />
        {reason && (
          <p>
            <span>Reason</span>
            <b>{reason}</b>
          </p>
        )}
        {error && (
          <p className="error-panel" role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className="modal-footer">
        <button
          className="button secondary"
          disabled={pending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button primary"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Closing..." : "Confirm & Close Day"}
        </button>
      </footer>
    </Modal>
  );
}
function SessionDetails({ day, onClose }) {
  return (
    <Modal
      title="Session Information"
      description={dateOnly(day.businessDate)}
      onClose={onClose}
    >
      <div className="modal-body day-confirm">
        {[
          ["Opened At", formatDate(day.openedAt)],
          ["Closed At", formatDate(day.closedAt)],
          ["Opened By", day.openedBy?.name],
          ["Closed By", day.closedBy?.name],
          ["Session Duration", duration(day.openedAt, day.closedAt)],
          ["Opening Cash", formatCurrency(day.openingCash)],
          ["Cash Sales", formatCurrency(day.cashSales)],
          ["Cash Expenses", formatCurrency(day.cashExpenses)],
          [
            "Cash Adjustments / Reversals",
            `${day.cashRefunds ? "− " : ""}${formatCurrency(day.cashRefunds || 0)}`,
          ],
          ["Expected Cash", formatCurrency(day.expectedCash)],
          ["Actual Cash", formatCurrency(day.actualCash)],
          ["Difference", status(day.difference, day.expectedCash).label],
          ["Difference Reason", day.differenceReason || "—"],
          ["Closing Note", day.closingNote || "—"],
        ].map(([l, v]) => (
          <p key={l}>
            <span>{l}</span>
            <b>{v}</b>
          </p>
        ))}
        <NegativeCashWarning expectedCash={day.expectedCash} />
        <Payments day={day} />
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Done
        </button>
      </footer>
    </Modal>
  );
}
function Payments({ day }) {
  return (
    <section className="panel day-payments">
      <header>
        <h2>{day.status === "CLOSED" ? "Payment Breakdown" : "Today’s Payment Breakdown"}</h2>
      </header>
      {day.paymentBreakdown ? (
        <>
          <div>
            {[
              "Cash",
              "UPI",
              "Card",
              "Split",
              ...day.paymentBreakdown
                .filter(
                  (p) => !["Cash", "UPI", "Card", "Split"].includes(p._id),
                )
                .map((p) => p._id),
            ].map((method) => (
              <p key={method}>
                <span>{method === "UPI" ? "GPay / UPI" : method}</span>
                <strong>
                  {formatCurrency(
                    day.paymentBreakdown.find((p) => p._id === method)?.total ||
                      0,
                  )}
                </strong>
              </p>
            ))}
            <p className="total">
              <span>Total Sales</span>
              <strong>{formatCurrency(day.totalSales)}</strong>
            </p>
          </div>
          <small className="muted">
            Split shows the full split-paid sale. Only its cash portion
            contributes to drawer cash; UPI and card do not.
          </small>
        </>
      ) : (
        <p className="muted">
          Payment breakdown was not saved for this older session.
        </p>
      )}
    </section>
  );
}
