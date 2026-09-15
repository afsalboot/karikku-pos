"use client";
import ReportsAnalytics from "@/components/reports-analytics";
import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useData } from "@/hooks/useData";
import { formatCurrency } from "@/lib/client";
import { businessDate } from "@/lib/dates";
import {
  PageHeading,
  Notice,
  DateRangePicker,
  EmptyState,
} from "@/components/ui/shared";
const colors = ["#285a3e", "#8aa96f", "#d4b66b", "#7f99ac"];
function DashboardReports({ dashboard = false }) {
  const [range, setRange] = useState({
    from: businessDate(),
    to: businessDate(),
  });
  const result = useData(`/reports?${new URLSearchParams(range)}`);
  const today = useData(dashboard ? "/dashboard" : null);
  const summary = dashboard ? today.data?.summary : result.data?.summary;
  const data = result.data;
  const cards = [
    [dashboard ? "Today's Sales" : "Total Sales", summary?.sales],
    [dashboard ? "Today's Expenses" : "Total Expenses", summary?.expenses],
    [dashboard ? "Today's Net Earnings" : "Net Earnings", summary?.netEarnings],
    [dashboard ? "Today's Orders" : "Total Orders", summary?.orders, true],
    ["Average Bill", summary?.averageBill],
  ];
  const paymentData = dashboard ? today.data?.payments : data?.payments;
  if (dashboard)
    for (const method of ["Cash", "UPI", "Card"])
      cards.push([
        `${method} Sales`,
        paymentData?.find((p) => p._id === method)?.total || 0,
      ]);
  else cards.push(["Discount Given", summary?.discount]);
  return (
    <>
      <PageHeading
        title={dashboard ? "Dashboard" : "Reports"}
        description={
          dashboard
            ? "Your shop at a glance. All figures use India Standard Time."
            : "Sales, spending, and net earnings for your selected period."
        }
      />
      {dashboard && <Notice {...today} retry={today.refresh} />}
      <div className="stats report-stats">
        {cards.map(([label, value, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              {value === undefined
                ? "—"
                : count
                  ? value
                  : formatCurrency(value)}
            </strong>
            {label.includes("Net Earnings") && <small>Sales − Expenses</small>}
          </div>
        ))}
      </div>
      <div className="report-toolbar">
        <h2>{dashboard ? "Business overview" : "Report period"}</h2>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <Notice {...result} retry={result.refresh}>
        {data && (
          <>
            <div className="chart-grid">
              <section className="panel">
                <h2>Sales vs Expenses</h2>
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.daily}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => date.slice(5)}
                        fontSize={11}
                      />
                      <YAxis fontSize={11} />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Legend />
                      <Bar
                        dataKey="sales"
                        name="Sales"
                        fill={colors[0]}
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Expenses"
                        fill={colors[2]}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
              <section className="panel">
                <h2>Payment methods</h2>
                {data.payments.length ? (
                  <>
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.payments}
                            dataKey="total"
                            nameKey="_id"
                            innerRadius={65}
                            outerRadius={95}
                          >
                            {data.payments.map((p, i) => (
                              <Cell
                                key={p._id}
                                fill={colors[i % colors.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v) => formatCurrency(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="payment-report">
                      {["Cash", "UPI", "Card", "Other"].map((m) => (
                        <p key={m}>
                          <span>{m}</span>
                          <strong>
                            {formatCurrency(
                              data.payments.find((p) => p._id === m)?.total ||
                                0,
                            )}
                          </strong>
                        </p>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState message="No completed payments" />
                )}
              </section>
            </div>
            <ReportTable
              title={dashboard ? "Top selling products" : "Product sales"}
              rows={dashboard ? data.products.slice(0, 10) : data.products}
              columns={[
                ["Product", "name"],
                ["Quantity sold", "quantity"],
                ["Revenue before bill discount and tax", "revenue", true],
              ]}
            />
            {!dashboard && (
              <>
                <p className="muted">
                  Product and category tables show up to 500 groups. Revenue is
                  before bill-level discount and GST; payment and cashier totals
                  include both.
                </p>
                <ReportTable
                  title="Category sales"
                  rows={data.categories}
                  columns={[
                    ["Category", "name"],
                    ["Quantity", "quantity"],
                    ["Revenue before bill discount and tax", "revenue", true],
                  ]}
                />
                <ReportTable
                  title="Expenses by category"
                  rows={data.expenseCategories}
                  columns={[
                    ["Category", "name"],
                    ["Expenses", "amount", true],
                  ]}
                />
                <ReportTable
                  title="Cashier report"
                  rows={data.cashiers}
                  columns={[
                    ["Cashier", "name"],
                    ["Orders", "orders"],
                    ["Sales", "sales", true],
                  ]}
                />
              </>
            )}
          </>
        )}
      </Notice>
    </>
  );
}
function ReportTable({ title, rows, columns }) {
  return (
    <section className="panel report-table">
      <h2>{title}</h2>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map(([label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  {columns.map(([, key, money]) => (
                    <td key={key}>
                      {money ? formatCurrency(row[key]) : row[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="No data for the selected date range" />
      )}
    </section>
  );
}

export default function ReportsWorkspace({ dashboard = false }) {
  return dashboard ? <DashboardReports dashboard /> : <ReportsAnalytics />;
}
