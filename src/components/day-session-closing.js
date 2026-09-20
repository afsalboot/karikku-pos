"use client";
import Select from "@/components/ui/select";
import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, formatCurrency as currency } from "@/lib/client";
import { cents, money } from "@/lib/calculations";
import {
  denominations,
  denominationTotal,
  differenceReasons,
  validCash,
  validSession,
  cashDifference,
} from "@/lib/day-closing";
import {
  DrawerSummary,
  DifferenceBadge,
  MoneyRows,
  sessionLabel,
} from "./day-session-summary";
export default function ClosingFlow({ day, refreshing, onRefresh, onClosed }) {
  const [step, setStep] = useState(1),
    [mode, setMode] = useState("denominations"),
    [counts, setCounts] = useState({}),
    [manual, setManual] = useState("");
  const [reason, setReason] = useState(""),
    [description, setDescription] = useState(""),
    [removed, setRemoved] = useState("0"),
    [note, setNote] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(null);
  const lock = useRef(false);
  const counted = denominationTotal(counts),
    actual = mode === "denominations" ? counted : manual;
  const difference = validCash(actual)
    ? cashDifference(actual, day.expectedCash)
    : null;
  const validReason =
    difference === 0 || (reason && (reason !== "Other" || description.trim()));
  const canCount = validSession(day) && day.expectedCash >= 0 && !refreshing;
  const stale = step > 1 && reviewed?.reviewToken !== day.reviewToken;
  const canContinue = canCount && !stale && validCash(actual) && validReason;
  const validRemoval =
    validCash(removed) && cents(Number(removed)) <= cents(Number(actual));
  const float = validRemoval
    ? money(cents(Number(actual)) - cents(Number(removed)))
    : null;
  async function close() {
    if (lock.current || !canContinue || !validRemoval) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const result = await api("/day-sessions", {
        method: "POST",
        body: {
          action: "close",
          sessionId: day._id,
          actualCash: Number(actual),
          expectedCash: reviewed.expectedCash,
          reviewToken: reviewed.reviewToken,
          differenceReason: difference ? reason : undefined,
          differenceDescription:
            difference && reason === "Other" ? description.trim() : undefined,
          cashRemovedAtClosing: Number(removed),
          closingFloat: float,
          closingNote: note.trim(),
          ...(mode === "denominations"
            ? {
                denominationBreakdown: Object.fromEntries(
                  [...denominations, "coins"].map((d) => [
                    d,
                    Number(counts[d] || 0),
                  ]),
                ),
                denominationCount: counted,
              }
            : {}),
        },
      });
      onClosed(result);
    } catch (e) {
      setError(e.message);
      setStep(1);
      onRefresh();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <section className="panel drawer-closing">
      {stale && <p className="error-panel" role="alert">Drawer totals changed. Go back to Review Session and review the cash count before closing.</p>}
      <ol className="drawer-steps" aria-label="Closing progress">
        {["Review session", "Count cash", "Close session"].map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {step === 1 && (
        <>
          <h2>Review Session</h2>
          <DrawerSummary day={day} />
          <div className="drawer-actions">
            <button
              className="button secondary"
              disabled={pending || refreshing}
              onClick={onRefresh}
            >
              <RefreshCw size={16} />
              {refreshing ? "Refreshing…" : "Refresh Totals"}
            </button>
            <button
              className="button primary"
              disabled={!canCount}
              onClick={() => {
                setReviewed({
                  expectedCash: day.expectedCash,
                  reviewToken: day.reviewToken,
                });
                setStep(2);
              }}
            >
              Continue to Cash Count
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h2>Count Cash</h2>
          <p className="muted">Count the drawer before removing any cash.</p>
          <label className="drawer-count-mode">
            Counting Method
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="denominations">
                Denomination count (recommended)
              </option>
              <option value="manual">Manual actual cash</option>
            </Select>
          </label>
          {mode === "denominations" ? (
            <div className="denominations">
              {denominations.map((d) => (
                <label key={d}>
                  <span>₹{d} ×</span>
                  <input
                    aria-label={`Quantity of ₹${d} notes`}
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    inputMode="numeric"
                    value={counts[d] ?? ""}
                    onChange={(e) => {
                      if (
                        e.target.value === "" ||
                        (/^\d+$/.test(e.target.value) &&
                          Number(e.target.value) <= 100000)
                      )
                        setCounts({ ...counts, [d]: e.target.value });
                    }}
                  />
                  <b>{currency(d * Number(counts[d] || 0))}</b>
                </label>
              ))}
              <label>
                <span>Coins</span>
                <input
                  aria-label="Total value of coins"
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  inputMode="decimal"
                  value={counts.coins ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "" || validCash(e.target.value))
                      setCounts({ ...counts, coins: e.target.value });
                  }}
                />
                <b>{currency(Number(counts.coins || 0))}</b>
              </label>
              <p>
                Total Counted <strong>{currency(counted)}</strong>
              </p>
            </div>
          ) : (
            <label>
              Actual Counted Cash (₹)
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                inputMode="decimal"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
            </label>
          )}
          {difference !== null && (
            <DifferenceBadge day={{ ...day, difference }} />
          )}
          {difference !== null && difference !== 0 && (
            <div className="difference-reason">
              <label>
                Reason for Difference *
                <Select
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">Choose a reason</option>
                  {differenceReasons.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </label>
              {reason === "Other" && (
                <label>
                  Describe the difference *
                  <textarea
                    required
                    maxLength={300}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              )}
              <small className="muted">
                Record normal cash in and cash out separately as drawer
                movements.
              </small>
            </div>
          )}
          <div className="drawer-actions">
            <button className="button secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="button primary"
              disabled={!canContinue}
              onClick={() => setStep(3)}
            >
              Continue to Closing
            </button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <h2>Close Session</h2>
          <p>{sessionLabel(day)}</p>
          <MoneyRows
            rows={[
              ["Expected Cash", reviewed.expectedCash],
              ["Actual Counted Cash", Number(actual)],
              ["Difference", difference],
            ]}
          />
          <DifferenceBadge day={{ ...day, difference }} />
          <fieldset disabled={pending}>
            <h3>Closing Drawer Management</h3>
            <label>
              Cash Removed (₹)
              <input
                type="number"
                min="0"
                max={Number(actual)}
                step="0.01"
                value={removed}
                onChange={(e) => setRemoved(e.target.value)}
              />
            </label>
            {!validRemoval && (
              <p className="error-panel">
                Cash removed must be between zero and actual counted cash.
              </p>
            )}
            <MoneyRows rows={[["Closing Float", float ?? 0]]} />
            <small className="muted">
              Closing float = actual counted cash − cash removed. This becomes
              the suggested opening cash.
            </small>
            <label>
              Closing Note
              <textarea
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </fieldset>
          <div className="drawer-actions">
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => setStep(2)}
            >
              Back
            </button>
            <button
              className="button secondary"
              disabled={pending}
              onClick={() => setStep(1)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={pending || !canContinue || !validRemoval}
              onClick={close}
            >
              {pending ? "Closing…" : "Confirm & Close Day"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
