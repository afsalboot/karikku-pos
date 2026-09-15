import { useState } from "react";
import { Banknote, Smartphone, CreditCard, X } from "lucide-react";
import { cents, money } from "@/lib/calculations";
import { normalizePayment, saleMethods, paymentLabel } from "@/lib/payments";
import { formatCurrency as currency } from "@/lib/client";
const icons = { Cash: Banknote, UPI: Smartphone, Card: CreditCard };
const displayNumber = (value) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
export function usePaymentDraft(total, methods, settings = {}) {
  const [method, setMethod] = useState("");
  const [split, setSplit] = useState(false);
  const [rows, setRows] = useState([]);
  const [received, setReceived] = useState(null);
  const enabled = saleMethods.filter((m) => methods.includes(m));
  const cash = split
    ? displayNumber(rows.find((r) => r.method === "Cash")?.value || 0)
    : method === "Cash"
      ? total
      : 0;
  const hasCash = split
    ? rows.some((r) => r.method === "Cash")
    : method === "Cash";
  const cashValue = received ?? String(Number.isFinite(cash) ? cash : 0);
  const paid = split
    ? rows.reduce((sum, r) => sum + cents(displayNumber(r.value || 0)), 0)
    : method
      ? cents(total)
      : 0;
  const remaining = cents(total) - paid;
  const input = {
    paymentMethod: split ? "Split" : method,
    ...(split
      ? {
          payments: rows.map((r) => ({
            method: r.method,
            amount: r.value === "" ? NaN : Number(r.value),
          })),
        }
      : {}),
    ...(hasCash && settings.cashAmountEntry !== false
      ? { cashReceived: cashValue === "" ? NaN : Number(cashValue) }
      : {}),
  };
  let payload = null,
    validation = "";
  try {
    normalizePayment(input, total, enabled);
    payload = input;
  } catch (e) {
    validation = e.message;
  }
  function choose(m) {
    setMethod(m);
    setReceived(null);
  }
  function toggleSplit(value) {
    setSplit(value);
    setRows([]);
    setMethod("");
    setReceived(null);
  }
  function amount(m, value) {
    setRows((current) =>
      current.map((r) => (r.method === m ? { ...r, value } : r)),
    );
  }
  function add(m) {
    setRows((current) => [...current, { method: m, value: "" }]);
    if (m === "Cash") setReceived(null);
  }
  function remove(m) {
    setRows((current) => current.filter((r) => r.method !== m));
    if (m === "Cash") setReceived(null);
  }
  return {
    settings,
    enabled,
    method,
    split,
    rows,
    cash,
    hasCash,
    cashValue,
    paid,
    remaining,
    payload,
    validation,
    choose,
    toggleSplit,
    amount,
    add,
    remove,
    setReceived,
  };
}
function MoneyInput({ label, value, onChange }) {
  return (
    <label className="field checkout-money-field">
      {label}
      <div>
        <span aria-hidden="true">₹</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          value={value}
          maxLength={12}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            if (/^\d*(\.\d{0,2})?$/.test(e.target.value))
              onChange(e.target.value);
          }}
          onBlur={() => {
            if (value !== "" && Number.isFinite(Number(value)))
              onChange(Number(value).toFixed(2));
          }}
        />
      </div>
    </label>
  );
}
export default function CheckoutPayment({ draft: d, total }) {
  const difference = Number.isFinite(Number(d.cashValue))
    ? cents(Number(d.cashValue)) - cents(d.cash)
    : -cents(d.cash);
  return (
    <section className="checkout-payment">
      <h3>Payment</h3>
      {!d.split && (
        <div
          className="checkout-methods"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, d.enabled.length)}, minmax(0, 1fr))` }}
          role="group"
          aria-label="Payment method"
        >
          {d.enabled.map((m) => {
            const Icon = icons[m];
            return (
              <button
                type="button"
                key={m}
                aria-pressed={d.method === m}
                onClick={() => d.choose(m)}
              >
                <Icon size={20} />
                {paymentLabel(m)}
              </button>
            );
          })}
        </div>
      )}
      {!d.enabled.length && (
        <p role="alert">
          Enable Cash, GPay / UPI or Card in Settings to take payment.
        </p>
      )}
      {d.settings.splitPayment !== false && <label className="option-toggle checkout-split-toggle">
        <strong>Split payment</strong>
        <input
          type="checkbox"
          role="switch"
          aria-label="Split payment"
          disabled={d.enabled.length < 2}
          checked={d.split}
          onChange={(e) => d.toggleSplit(e.target.checked)}
        />
      </label>}
      {d.split && (
        <div className="checkout-split-rows">
          {d.rows.map((r) => (
            <section className="checkout-split-row" key={r.method}>
              <div className="checkout-row-heading">
                <strong>{paymentLabel(r.method)}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${paymentLabel(r.method)} payment`}
                  onClick={() => d.remove(r.method)}
                >
                  <X size={16} />
                </button>
              </div>
              <MoneyInput
                label={`${paymentLabel(r.method)} amount applied`}
                value={r.value}
                onChange={(v) => d.amount(r.method, v)}
              />
              {d.remaining > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    d.amount(
                      r.method,
                      money(
                        cents(displayNumber(r.value || 0)) + d.remaining,
                      ).toFixed(2),
                    )
                  }
                >
                  Pay remaining {currency(money(d.remaining))}
                </button>
              )}
            </section>
          ))}
          <div className="checkout-quick">
            {d.enabled
              .filter((m) => !d.rows.some((r) => r.method === m))
              .map((m) => (
                <button
                  className="button secondary"
                  type="button"
                  key={m}
                  onClick={() => d.add(m)}
                >
                  + Add {paymentLabel(m)}
                </button>
              ))}
          </div>
          <div className="checkout-payment-totals" aria-live="polite">
            <div>
              <span>Paid</span>
              <strong>{currency(money(d.paid))}</strong>
            </div>
            <div>
              <span>{d.remaining < 0 ? "Overallocated" : "Remaining"}</span>
              <strong>{currency(money(Math.abs(d.remaining)))}</strong>
            </div>
          </div>
          {d.remaining < 0 && (
            <p className="form-error" role="alert">
              Split payment exceeds the amount due.
            </p>
          )}
        </div>
      )}
      {d.hasCash && d.settings.cashAmountEntry !== false && (
        <section className="checkout-cash-panel">
          <h4>Cash Payment</h4>
          <div
            className={`checkout-change ${difference < 0 ? "insufficient" : ""}`}
            aria-live="polite"
          >
            <span>
              {difference < 0 ? "Remaining cash" : "Change to return"}
            </span>
            <strong>{currency(money(Math.abs(difference)))}</strong>
          </div>
          <MoneyInput
            label={d.split ? "Cash received" : "Amount Received"}
            value={d.cashValue}
            onChange={d.setReceived}
          />
          <div className="checkout-due">
            <span>{d.split ? "Cash amount applied" : "Amount due"}</span>
            <strong>{currency(d.cash)}</strong>
          </div>
          <div className="checkout-quick">
            <button
              type="button"
              className="button secondary"
              onClick={() => d.setReceived(d.cash.toFixed(2))}
            >
              Exact
            </button>
            {[500, 1000, 2000]
              .filter((v) => v > d.cash)
              .map((v) => (
                <button
                  type="button"
                  className="button secondary"
                  key={v}
                  onClick={() => d.setReceived(v.toFixed(2))}
                >
                  {currency(v)}
                </button>
              ))}
          </div>
        </section>
      )}
      {!d.split && d.method && d.method !== "Cash" && (
        <div className="checkout-digital">
          <strong>{paymentLabel(d.method)} Payment</strong>
          {d.method === "UPI" && d.settings.upiId && <span>Pay to: {d.settings.upiId}</span>}
          <span>Amount to collect</span>
          <b>{currency(total)}</b>
        </div>
      )}
      {(d.method || d.split) && (
        <section className="checkout-payment-summary">
          <h4>Payment Summary</h4>
          <div>
            <span>Total</span>
            <strong>{currency(total)}</strong>
          </div>
          {(d.split
            ? d.rows.map((r) => ({
                method: r.method,
                amount: Number(r.value || 0),
              }))
            : [{ method: d.method, amount: total }]
          ).map((r) => (
            <div key={r.method}>
              <span>{paymentLabel(r.method)}</span>
              <span>{currency(Number.isFinite(r.amount) ? r.amount : 0)}</span>
            </div>
          ))}
          {d.hasCash && (
            <>
              <div>
                <span>Cash received</span>
                <span>{currency(Number(d.cashValue) || 0)}</span>
              </div>
              <div>
                <span>{difference < 0 ? "Remaining cash" : "Change"}</span>
                <span>{currency(money(Math.abs(difference)))}</span>
              </div>
            </>
          )}
          {d.split && (
            <>
              <div>
                <span>Paid</span>
                <span>{currency(money(d.paid))}</span>
              </div>
              <div>
                <span>{d.remaining < 0 ? "Overallocated" : "Remaining"}</span>
                <span>{currency(money(Math.abs(d.remaining)))}</span>
              </div>
            </>
          )}
        </section>
      )}
      {(d.method || d.split) && d.validation && d.remaining >= 0 && (
        <p className="checkout-validation">{d.validation}</p>
      )}
    </section>
  );
}
