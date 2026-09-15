import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { dateBounds } from "@/lib/dates";

export default function DashboardHeader({
  user,
  period,
  range,
  onPeriod,
  onRange,
  onRefresh,
  loading,
}) {
  const [draft, setDraft] = useState(range);
  const [error, setError] = useState("");
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  function apply(event) {
    event.preventDefault();
    try {
      dateBounds(draft.from, draft.to);
      setError("");
      onRange(draft);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <header className="dash-header">
      <div className="dash-heading-row">
        <div>
          <h1>Dashboard</h1>
          <p className="dash-greeting">
            {greeting}, {user.name}
          </p>
          <p className="dash-muted">
            Here’s how your shop is performing{" "}
            {period === "today" ? "today" : "for this period"}.
          </p>
        </div>
        <div className="dash-actions">
          <Link className="button primary" href="/pos">
            <Plus size={17} />
            New Sale
          </Link>
          <Link className="button secondary" href="/expenses?add=1">
            <Plus size={17} />
            Add Expense
          </Link>
        </div>
      </div>
      <div className="dash-filter-row">
        <div
          className="dash-periods"
          role="group"
          aria-label="Dashboard period"
        >
          {[
            ["today", "Today"],
            ["7", "7 Days"],
            ["30", "30 Days"],
            ["custom", "Custom"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={period === value}
              onClick={() => {
                setDraft(range);
                setError("");
                onPeriod(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="dash-date">
          {range.from === range.to
            ? new Date(`${range.from}T12:00:00`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : `${range.from} — ${range.to}`}{" "}
          <small>IST</small>
        </span>
        <button
          className="icon-button dash-refresh"
          type="button"
          aria-label="Refresh dashboard"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {period === "custom" && (
        <form className="dash-custom-range" onSubmit={apply}>
          <label>
            From Date
            <input
              type="date"
              required
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label>
            To Date
            <input
              type="date"
              required
              min={draft.from}
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <button className="button secondary" type="submit">
            Apply dates
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </header>
  );
}
