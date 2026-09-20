"use client";
import { useState } from "react";
import { cents } from "@/lib/calculations";
import { validCash } from "@/lib/day-closing";
import { formatCurrency as currency, formatDate } from "@/lib/client";
import { MoneyRows, sessionLabel } from "./day-session-summary";
export default function OpenDay({ previous, pending, onOpen }) {
  const hasFloat = Number.isFinite(previous?.closingFloat);
  const [cash, setCash] = useState(
    String(hasFloat ? previous.closingFloat : 0),
  );
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const adjusted =
    hasFloat && cents(Number(cash)) !== cents(previous.closingFloat);
  return (
    <section className="panel drawer-open">
      <h2>Start Business Day</h2>
      <div className="drawer-columns">
        <div>
          {previous ? (
            <>
              <h3>Previous Session</h3>
              <p>{sessionLabel(previous)}</p>
              <small className="muted">
                Closed {formatDate(previous.closedAt)}
              </small>
              <MoneyRows
                rows={[
                  ["Actual cash counted", previous.actualCash],
                  ...(hasFloat
                    ? [
                        [
                          "Cash removed at closing",
                          previous.cashRemovedAtClosing,
                        ],
                        ["Closing float", previous.closingFloat],
                      ]
                    : []),
                ]}
              />
              {hasFloat ? (
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending}
                  onClick={() => {
                    setCash(String(previous.closingFloat));
                    setReason("");
                  }}
                >
                  Use {currency(previous.closingFloat)}
                </button>
              ) : (
                <p className="muted">
                  Closing float was not recorded for this older session. Enter
                  the cash available in the drawer.
                </p>
              )}
            </>
          ) : (
            <p className="muted">
              Your first session starts with zero opening cash. Enter the float
              available in the drawer.
            </p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onOpen({
              openingCash: Number(cash),
              ...(adjusted
                ? {
                    openingAdjustmentReason:
                      reason === "Other" ? other.trim() : reason,
                  }
                : {}),
            });
          }}
        >
          <fieldset disabled={pending}>
            <label>
              Opening Cash (₹)
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                value={cash}
                onChange={(e) => setCash(e.target.value)}
              />
            </label>
            {hasFloat && !adjusted && (
              <small className="muted">Using previous closing float</small>
            )}
            {adjusted && (
              <>
                <label>
                  Opening Adjustment Reason *
                  <select
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    <option value="">Choose a reason</option>
                    {[
                      "Float changed by administrator",
                      "Cash manually added",
                      "Previous float unavailable",
                      "Correction",
                      "Other",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                {reason === "Other" && (
                  <label>
                    Describe the adjustment
                    <input
                      required
                      maxLength={300}
                      value={other}
                      onChange={(e) => setOther(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}
          </fieldset>
          <button
            className="button primary"
            disabled={
              pending ||
              !validCash(cash) ||
              (adjusted && (!reason || (reason === "Other" && !other.trim())))
            }
          >
            {pending ? "Opening…" : "Open Business Day"}
          </button>
        </form>
      </div>
    </section>
  );
}
