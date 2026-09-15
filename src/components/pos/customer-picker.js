import { useId, useState } from "react";
import { useData, useDebounce } from "@/hooks/useData";
export default function CustomerPicker({ customer, setCustomer, required = false }) {
  const [active, setActive] = useState(null);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const query = active ? customer[active].trim() : "";
  const debounced = useDebounce(query, 300);
  const searching = active && query.length >= 2;
  const result = useData(
    searching && debounced === query
      ? `/customers?lookup=true&q=${encodeURIComponent(debounced)}`
      : null,
  );
  const loading = searching && (debounced !== query || result.loading);
  const items = result.data?.items || [];
  function select(c) {
    setCustomer({ name: c.name, phone: c.phone, customerId: c._id, loyalty: c.loyalty });
    setActive(null);
    setHighlight(0);
  }
  function keydown(e) {
    if (!searching) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setActive(null);
    }
    if (items.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      setHighlight(
        (n) =>
          (n + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length,
      );
    }
    if (e.key === "Enter" && items.length) {
      e.preventDefault();
      select(items[Math.min(highlight, items.length - 1)]);
    }
  }
  return (
    <section
      className="checkout-customer-picker space-y-3"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setActive(null);
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">Customer details</h3>
        <p className="mt-1 text-xs text-[#6a756c]">
          Search by name or phone to select a saved customer. {required ? "Customer name and phone are required." : "Optional for walk-ins."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["name", "Customer name", "Enter name", 100],
          ["phone", "Phone number", "Enter phone number", 30],
        ].map(([field, label, placeholder, maxLength]) => (
          <label className="field" key={field}>
            {label}
            <input
              type={field === "phone" ? "tel" : "text"}
              inputMode={field === "phone" ? "tel" : undefined}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(searching && active === field)}
              aria-controls={searching && active === field ? listId : undefined}
              aria-activedescendant={
                searching && active === field && items.length
                  ? `${listId}-${Math.min(highlight, items.length - 1)}`
                  : undefined
              }
              maxLength={maxLength}
              value={customer[field]}
              required={required || Boolean(
                customer[field === "name" ? "phone" : "name"].trim(),
              )}
              placeholder={placeholder}
              onFocus={() => {
                setActive(field);
                setHighlight(0);
              }}
              onChange={(e) => {
                // Typed edits may describe a different customer than the saved
                // selection, so do not show that customer's loyalty status.
                const { customerId: _customerId, loyalty: _loyalty, ...details } = customer;
                setCustomer({ ...details, [field]: e.target.value });
                setActive(field);
                setHighlight(0);
              }}
              onKeyDown={keydown}
            />
          </label>
        ))}
      </div>
      {searching && (
        <div className="checkout-customer-suggestions">
          <div
            id={listId}
            role="listbox"
            aria-label="Existing customers"
            aria-busy={Boolean(loading)}
          >
            {!loading &&
              items.map((c, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  id={`${listId}-${i}`}
                  tabIndex={-1}
                  key={c._id}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => select(c)}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <strong>{c.name}</strong>
                  <span>{c.phone}</span>
                </button>
              ))}
          </div>
          {loading ? (
            <p role="status">Finding customers…</p>
          ) : result.error ? (
            <p role="status">
              Could not load suggestions. You can still enter customer details.
            </p>
          ) : !items.length ? (
            <p role="status">
              No matching customer. Enter both fields to save a new customer at
              checkout.
            </p>
          ) : (
            <small>Select a customer to fill both fields.</small>
          )}
        </div>
      )}
    </section>
  );
}
