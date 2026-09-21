"use client";
import Select from "@/components/ui/select";
import DateInput from "@/components/ui/date-input";
import { useState } from "react";
import { subDays, startOfWeek, startOfMonth, format } from "date-fns";
import { businessDate } from "@/lib/dates";
import Modal from "@/components/modal";
export function PageHeading({ title, description, children }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Field({ label, children, ...props }) {
  return (
    <label className="field">
      {label}
      {children || <input {...props} />}
    </label>
  );
}
export function Notice({ error, loading, children, retry }) {
  if (loading)
    return (
      <div className="loading" role="status">
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="error-panel" role="alert">
        <p>{error}</p>
        {retry && (
          <button className="button secondary" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  return children;
}
export function EmptyState({
  message = "No records found",
  description,
  children,
}) {
  return (
    <div className="empty-state" role="status">
      <h2>{message}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Pagination({ data, page, setPage }) {
  return (
    <footer className="table-footer pagination">
      <span>
        {data?.total || 0} records · Page {page} of{" "}
        {Math.max(1, data?.pages || 1)}
      </span>
      <button
        className="button secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <button
        className="button secondary"
        disabled={page >= (data?.pages || 1)}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </footer>
  );
}
export function ConfirmModal({ title, message, onConfirm, onClose, pending }) {
  return (
    <Modal title={title} onClose={pending ? () => {} : onClose}>
      <div className="modal-body">
        <p>{message}</p>
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
          className="button danger"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Working…" : "Confirm"}
        </button>
      </footer>
    </Modal>
  );
}
export function DateRangePicker({ value, onChange }) {
  const [preset, setPreset] = useState("today");
  function choose(key) {
    setPreset(key);
    const now = new Date(`${businessDate()}T12:00:00`);
    let from = now,
      to = now;
    if (key === "yesterday") from = to = subDays(now, 1);
    if (key === "week") from = startOfWeek(now, { weekStartsOn: 1 });
    if (key === "7days") from = subDays(now, 6);
    if (key === "month") from = startOfMonth(now);
    if (key !== "custom")
      onChange({
        from: format(from, "yyyy-MM-dd"),
        to: format(to, "yyyy-MM-dd"),
      });
  }
  return (
    <div className="date-range">
      <Select
        aria-label="Date range"
        value={preset}
        onChange={(e) => choose(e.target.value)}
      >
        <option value="today">Today</option>
        <option value="yesterday">Yesterday</option>
        <option value="7days">Last 7 days</option>
        <option value="week">This week</option>
        <option value="month">This month</option>
        <option value="custom">Custom range</option>
      </Select>
      <DateInput
        aria-label="From date"
        type="date"
        value={value.from}
        rangeStart={value.from}
        rangeEnd={value.to}
        max={value.to || undefined}
        onChange={(e) => {
          setPreset("custom");
          onChange({ ...value, from: e.target.value });
        }}
      />
      <DateInput
        aria-label="To date"
        type="date"
        value={value.to}
        rangeStart={value.from}
        rangeEnd={value.to}
        min={value.from || undefined}
        onChange={(e) => {
          setPreset("custom");
          onChange({ ...value, to: e.target.value });
        }}
      />
    </div>
  );
}
