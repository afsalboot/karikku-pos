"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Receipt, WalletCards } from "lucide-react";
import { api, formatCurrency } from "@/lib/client";
import { businessDate } from "@/lib/dates";
import {
  summarizeExpenses,
  filterExpenses,
  previousExpenseRange,
  expenseDays,
} from "@/lib/expense-insights";

// Read every API page before showing totals; never infer analytics from one table page.
export function useExpenseRecords(range) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({});
  const key = `${range.from}:${range.to}:${version}`;
  useEffect(() => {
    const controller = new AbortController();
    async function read(period) {
      const params = new URLSearchParams({ ...period, limit: 100 });
      const first = await api(`/expenses?${params}&page=1`, {
        signal: controller.signal,
      });
      const items = [...first.items];
      for (let page = 2; page <= first.pages; page++) {
        const next = await api(`/expenses?${params}&page=${page}`, {
          signal: controller.signal,
        });
        items.push(...next.items);
      }
      return items;
    }
    Promise.all([read(range), read(previousExpenseRange(range))])
      .then(([items, previous]) => {
        if (!controller.signal.aborted) setState({ key, items, previous });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, error: error.message });
      });
    return () => controller.abort();
  }, [key, range]);
  return {
    items: state.key === key ? state.items || [] : [],
    previous: state.key === key ? state.previous || [] : [],
    loading: state.key !== key,
    error: state.key === key ? state.error : "",
    refresh: () => setVersion((value) => value + 1),
  };
}

export function ExpenseInsights({ items, previous, filters, range }) {
  const summary = summarizeExpenses(items);
  const previousTotal = summarizeExpenses(
    filterExpenses(previous, filters),
  ).amount;
  const change = previousTotal
    ? ((summary.amount - previousTotal) / previousTotal) * 100
    : null;
  const amounts = new Map();
  items.forEach((item) => {
    const day = businessDate(new Date(item.expenseDate));
    amounts.set(day, (amounts.get(day) || 0) + item.amount);
  });
  const daily = expenseDays(range).map((date) => ({
    date,
    amount: amounts.get(date) || 0,
  }));
  const previousRange = previousExpenseRange(range);
  return (
    <div className="expense-analytics-grid">
      <section className="expense-insight-card expense-spending">
        <header>
          <div>
            <h2>Spending Overview</h2>
            <p>Daily expenses across your selected period</p>
          </div>
          <WalletCards size={18} />
        </header>
        <div className="expense-comparison">
          <div>
            <strong>{formatCurrency(summary.amount)}</strong>
            <small>Current period</small>
          </div>
          <div>
            <strong>{formatCurrency(previousTotal)}</strong>
            <small>Previous {daily.length}-day period</small>
          </div>
          <span className="expense-change">
            {change === null
              ? summary.amount
                ? "No prior spending"
                : "No change"
              : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
          </span>
        </div>
        <p className="expense-comparison-dates">
          Compared with {previousRange.from} – {previousRange.to}. Same filters
          applied.
        </p>
        {items.length ? (
          <div className="expense-daily-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={daily}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
                accessibilityLayer
              >
                <CartesianGrid
                  vertical={false}
                  stroke="#e9eee8"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                    })
                  }
                  axisLine={false}
                  tickLine={false}
                  minTickGap={35}
                  tick={{ fontSize: 11, fill: "#66756e" }}
                />
                <YAxis
                  width={58}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#66756e" }}
                  tickFormatter={(value) =>
                    `₹${value >= 1000 ? `${+(value / 1000).toFixed(1)}k` : value}`
                  }
                />
                <Tooltip
                  cursor={{ fill: "#edf5e8" }}
                  formatter={(value) => [formatCurrency(value), "Expenses"]}
                  labelFormatter={(value) =>
                    new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  }
                />
                <Bar
                  dataKey="amount"
                  fill="#145a3a"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="expense-chart-empty">
            <Receipt size={28} />
            <p>No spending in this period</p>
            <small>Your daily expense trend will appear here.</small>
          </div>
        )}
      </section>
      <div className="expense-insight-side">
        <ExpenseDistribution
          title="Expenses by Category"
          rows={summary.categories}
          total={summary.amount}
        />
        <ExpenseDistribution
          title="Payment Breakdown"
          rows={summary.payments.map((row) => ({
            ...row,
            _id: row._id === "UPI" ? "GPay / UPI" : row._id,
          }))}
          total={summary.amount}
        />
      </div>
    </div>
  );
}

function ExpenseDistribution({ title, rows, total }) {
  return (
    <section className="expense-insight-card expense-distribution">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="expense-distribution-list">
          {rows.map((row) => {
            const percent = total ? (row.amount / total) * 100 : 0;
            return (
              <div key={row._id} className="expense-distribution-row">
                <div>
                  <span>{row._id}</span>
                  <strong>{formatCurrency(row.amount)}</strong>
                  <small>{percent.toFixed(1)}%</small>
                </div>
                <div className="expense-track">
                  <i style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="expense-muted">No expenses to break down yet.</p>
      )}
    </section>
  );
}

export function ExpenseSkeleton({ compact = false }) {
  return (
    <div
      className={`expense-loading ${compact ? "compact" : ""}`}
      role="status"
      aria-label="Loading expenses"
    >
      <span className="sr-only">Loading expenses</span>
      {Array.from({ length: compact ? 5 : 4 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
