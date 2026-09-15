import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatCurrency as currency } from "@/lib/client";
import { DashboardCard, DashboardEmpty } from "./dashboard-cards";
import { hourlySeries } from "./period";
const colors = ["#174d3b", "#72947a", "#a5b99b", "#d9e2d3"];
export const paymentRows = (payments) =>
  ["Cash", "UPI", "Card", "Other"].map((name, index) => ({
    name,
    total: payments.find((p) => p._id === name)?.total || 0,
    color: colors[index],
  }));
function SalesTooltip({ active, payload, label, hourly }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <p key={item.dataKey}>
          {item.name}: {currency(item.value)}
        </p>
      ))}
      {hourly && <p>Orders: {payload[0].payload.orders}</p>}
    </div>
  );
}
export function SalesPerformanceChart({ data, today }) {
  const series = today
    ? hourlySeries(data.hourly)
    : data.daily.map((item) => ({
        ...item,
        label: new Date(`${item.date}T12:00:00`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
      }));
  return (
    <DashboardCard title="Sales Performance" className="dash-performance">
      <div className="dash-chart-summary">
        {[
          ["Total Sales", data.summary.sales],
          ["Total Expenses", data.summary.expenses],
          ["Net", data.summary.netEarnings],
        ].map(([name, value]) => (
          <div key={name}>
            <small>{name}</small>
            <strong>{currency(value)}</strong>
          </div>
        ))}
      </div>
      {data.summary.orders || (!today && data.summary.expenses) ? (
        <>
          <div
            className="dash-sales-chart"
            role="img"
            aria-label={
              today
                ? "Hourly sales and order totals in India Standard Time"
                : "Daily sales and expenses for the selected period"
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  stroke="#eaf0e7"
                  vertical={false}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  width={48}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    value >= 100000
                      ? `₹${(value / 100000).toFixed(1)}L`
                      : value >= 1000
                        ? `₹${(value / 1000).toFixed(0)}k`
                        : `₹${value}`
                  }
                />
                <Tooltip content={<SalesTooltip hourly={today} />} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Sales"
                  stroke="#174d3b"
                  strokeWidth={2.5}
                  fill="#e8f0df"
                  fillOpacity={0.7}
                  isAnimationActive={false}
                />
                {!today && (
                  <Area
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#9b8767"
                    fill="#eee9df"
                    fillOpacity={0.35}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="dash-chart-legend">
            <span>
              <i style={{ background: colors[0] }} />
              Sales
            </span>
            {!today && (
              <span>
                <i style={{ background: "#9b8767" }} />
                Expenses
              </span>
            )}
            <small>{today ? "Hourly · IST" : "Daily · IST"}</small>
          </div>
        </>
      ) : (
        <DashboardEmpty
          message={
            today
              ? "No sales recorded yet today."
              : "No sales or expenses recorded in this period."
          }
          sale
        />
      )}
    </DashboardCard>
  );
}
export function PaymentMethodChart({ payments }) {
  const rows = paymentRows(payments);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return (
    <DashboardCard title="Payment Methods">
      <div className="dash-donut-wrap">
        {total > 0 ? (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows.filter((row) => row.total > 0)}
                  dataKey="total"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={76}
                  strokeWidth={3}
                  isAnimationActive={false}
                >
                  {rows
                    .filter((row) => row.total > 0)
                    .map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                </Pie>
                <Tooltip formatter={(value) => currency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="dash-donut-center">
              <strong>{currency(total)}</strong>
              <small>Total Collected</small>
            </div>
          </>
        ) : (
          <div className="dash-zero-payments">
            <strong>{currency(0)}</strong>
            <small>No payments collected</small>
          </div>
        )}
      </div>
      <div className="dash-payment-list">
        {rows.map((row) => (
          <div key={row.name}>
            <span>
              <i style={{ background: row.color }} />
              {row.name}
            </span>
            <strong>{currency(row.total)}</strong>
            <small>{total ? Math.round((row.total / total) * 100) : 0}%</small>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
