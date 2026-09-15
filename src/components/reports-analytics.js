"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  Download,
  IndianRupee,
  Package,
  Percent,
  Printer,
  ReceiptText,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useData } from "@/hooks/useData";
import { formatCurrency } from "@/lib/client";
import { businessDate } from "@/lib/dates";
import { PageHeading } from "@/components/ui/shared";
import {
  reportRange,
  reportPayments,
  reportHours,
  reportTimeline,
  reportCsv,
} from "@/lib/report-presentation";
import "./reports-premium.css";

const methods = ["Cash", "UPI", "Card"],
  colors = ["#285a3e", "#91a96d", "#879e99"];
const dateLabel = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const getRange = (period) => reportRange(period, businessDate());
const rows = (items) => (Array.isArray(items) ? items : []);

export default function ReportsAnalytics() {
  const [period, setPeriod] = useState("today"),
    [range, setRange] = useState(() => getRange("today")),
    [sort, setSort] = useState("revenue");
  const [draft, setDraft] = useState(range);
  const [rangeError, setRangeError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const report = useData(`/reports?${new URLSearchParams(range)}`),
    data = report.data,
    summary = data?.summary;
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${range.to}T12:00:00`) - new Date(`${range.from}T12:00:00`)) /
        86400000,
    ) + 1,
  );
  const payments = useMemo(
    () => reportPayments(data?.payments),
    [data?.payments],
  );
  const ranked = useMemo(
    () =>
      [...rows(data?.products)].sort(
        (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name),
      ),
    [data?.products],
  );
  const grossTotal = rows(data?.categories).reduce(
    (sum, row) => sum + row.revenue,
    0,
  );
  const timeline = useMemo(
    () => reportTimeline(rows(data?.daily)),
    [data?.daily],
  );
  const products = useMemo(
    () =>
      [...rows(data?.products)].sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "quantity"
            ? b.quantity - a.quantity
            : b.revenue - a.revenue,
      ),
    [data?.products, sort],
  );
  const hourly = useMemo(() => {
    if (days > 1)
      return rows(data?.daily).map((item) => ({
        label: dateLabel.format(new Date(`${item.date}T12:00:00+05:30`)),
        sales: item.sales,
      }));
    return reportHours(data?.hourly);
  }, [data?.daily, data?.hourly, days]);
  const topProduct = ranked[0],
    topCategory = rows(data?.categories)[0],
    peak = hourly.reduce(
      (best, item) => (item.sales > (best?.sales || 0) ? item : best),
      null,
    ),
    topPayment = [...payments].sort((a, b) => b.amount - a.amount)[0];
  const setPreset = (next) => {
    setPeriod(next);
    setRangeError("");
    setShowAll(false);
    if (next !== "custom") {
      const selected = getRange(next);
      setRange(selected);
      setDraft(selected);
    } else setDraft(range);
  };
  const exportCsv = () => {
    if (!data) return;
    const csv = reportCsv(data, range);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `karikku-report-${range.from}-to-${range.to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  return (
    <div className="reports-workspace">
      <PageHeading
        title="Reports & Analytics"
        description="Track sales, expenses and business performance."
      >
        <div className="report-actions">
          <button
            className="button secondary"
            onClick={exportCsv}
            disabled={!data}
          >
            <Download size={16} /> Export Report
          </button>
          <button
            className="button secondary"
            disabled={!data}
            onClick={() => window.print()}
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </PageHeading>
      <p className="report-print-period">
        Report period: {range.from} to {range.to} · India Standard Time
      </p>
      <form
        className="report-filter"
        onSubmit={(event) => {
          event.preventDefault();
          const span =
            (Date.parse(draft.to) - Date.parse(draft.from)) / 86400000;
          if (
            !draft.from ||
            !draft.to ||
            !Number.isFinite(span) ||
            span < 0 ||
            span > 365
          ) {
            setRangeError("Choose a valid range of up to 366 days.");
            return;
          }
          setRangeError("");
          setRange(draft);
          setShowAll(false);
        }}
      >
        <CalendarDays size={18} />
        <label>
          <span>Period</span>
          <select
            aria-label="Period"
            value={period}
            onChange={(e) => setPreset(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisWeek">This Week</option>
            <option value="lastWeek">Last Week</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </label>
        <DateField
          label="From date"
          value={draft.from}
          disabled={period !== "custom"}
          onChange={(from) => {
            setPeriod("custom");
            setDraft({ ...draft, from });
          }}
        />
        <DateField
          label="To date"
          value={draft.to}
          disabled={period !== "custom"}
          onChange={(to) => {
            setPeriod("custom");
            setDraft({ ...draft, to });
          }}
        />
        {period === "custom" && (
          <button className="button primary" type="submit">
            Apply Range
          </button>
        )}
        <small className="report-period-note">
          {dateLabel.format(new Date(`${range.from}T12:00:00+05:30`))} –{" "}
          {dateLabel.format(new Date(`${range.to}T12:00:00+05:30`))}{" "}
          {range.to.slice(0, 4)} · IST
        </small>
        {rangeError && (
          <p className="form-error" role="alert">
            {rangeError}
          </p>
        )}
      </form>
      {report.error ? (
        <div className="error-panel" role="alert">
          <p>{report.error}</p>
          <button className="button secondary" onClick={report.refresh}>
            Try again
          </button>
        </div>
      ) : report.loading || !data ? (
        <Skeleton />
      ) : (
        <>
          <section className="report-kpis">
            <Kpi
              icon={IndianRupee}
              label="Total Sales"
              value={formatCurrency(summary.sales)}
            />
            <Kpi
              icon={WalletCards}
              label="Total Expenses"
              value={formatCurrency(summary.expenses)}
            />
            <Kpi
              icon={TrendingUp}
              label="Net Earnings"
              value={formatCurrency(summary.netEarnings)}
              note="Sales − Expenses"
            />
            <Kpi
              icon={ReceiptText}
              label="Total Orders"
              value={summary.orders}
            />
            <Kpi
              icon={BarChart3}
              label="Average Bill"
              value={formatCurrency(summary.averageBill)}
            />
            <Kpi
              icon={Percent}
              label="Discount Given"
              value={formatCurrency(summary.discount)}
            />
          </section>
          <section className="report-analytics-grid">
            <article className="panel report-card">
              <Heading
                title="Sales & Expenses"
                sub={
                  days === 1
                    ? "Daily totals · hourly sales shown below"
                    : days > 180
                      ? "Monthly totals for the selected period"
                      : days > 62
                        ? "Weekly totals for the selected period"
                        : "Daily performance for the selected period"
                }
              />
              {summary.orders || summary.expenses ? (
                <SalesChart data={timeline} />
              ) : (
                <Empty text="No sales or expenses were recorded for this period." />
              )}
            </article>
            <article className="panel report-card">
              <Heading
                title="Payment Methods"
                sub="Completed payment allocations"
              />
              {payments.some((p) => p.amount) ? (
                <>
                  <div className="payment-donut">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={payments.filter((p) => p.amount)}
                          isAnimationActive={false}
                          dataKey="amount"
                          nameKey="name"
                          innerRadius={58}
                          outerRadius={78}
                          paddingAngle={3}
                        >
                          {payments
                            .filter((p) => p.amount)
                            .map((p) => (
                              <Cell
                                key={p.name}
                                fill={colors[methods.indexOf(p.name)]}
                              />
                            ))}
                        </Pie>
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div>
                      <strong>
                        {formatCurrency(
                          payments.reduce((s, p) => s + p.amount, 0),
                        )}
                      </strong>
                      <span>Payments</span>
                    </div>
                  </div>
                  <div className="payment-list">
                    {payments.map((p, i) => (
                      <div key={p.name}>
                        <i style={{ background: colors[i] }} />
                        <span>{p.name === "UPI" ? "UPI / GPay" : p.name}</span>
                        <strong>{formatCurrency(p.amount)}</strong>
                        <small>{p.percent.toFixed(1)}%</small>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Empty text="No completed payments for this period." />
              )}
            </article>
          </section>
          <section className="report-secondary-grid">
            <article className="panel report-card">
              <Heading
                title={days === 1 ? "Sales by Hour" : "Sales by Day"}
                sub="Find your busiest selling times"
              />
              {summary.orders ? (
                <div className="compact-chart">
                  <ResponsiveContainer>
                    <BarChart data={hourly} accessibilityLayer>
                      <CartesianGrid stroke="#edf0e9" vertical={false} />
                      <XAxis
                        dataKey="label"
                        fontSize={10}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        fontSize={10}
                        width={44}
                        tickFormatter={(v) => `₹${v}`}
                      />
                      <Tooltip formatter={(v) => formatCurrency(v)} />
                      <Bar
                        isAnimationActive={false}
                        dataKey="sales"
                        name="Sales"
                        fill="#285a3e"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty text="No sales were recorded for this period." />
              )}
            </article>
            <article className="panel report-card">
              <Heading
                title="Top Selling Products"
                sub="By selected-period revenue"
              />
              {products.length ? (
                <div className="top-products">
                  {ranked.slice(0, 5).map((p, i) => (
                    <div key={p._id || p.name}>
                      <b>#{i + 1}</b>
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.quantity} sold ·{" "}
                          {grossTotal
                            ? ((p.revenue / grossTotal) * 100).toFixed(1)
                            : 0}
                          % of gross revenue
                        </small>
                        <em>
                          <i
                            style={{
                              width: `${(p.revenue / (grossTotal || 1)) * 100}%`,
                            }}
                          />
                        </em>
                      </span>
                      <strong>{formatCurrency(p.revenue)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="No products were sold for this period." />
              )}
              {products.length > 0 && (
                <a
                  className="report-view-all"
                  href="#report-products"
                  onClick={() => setShowAll(true)}
                >
                  View All Products →
                </a>
              )}
            </article>
          </section>
          <section className="report-secondary-grid">
            <Table
              title="Category Performance"
              sub="Revenue before invoice-level discounts and tax"
              rows={rows(data.categories)}
              cols={[
                ["Category", "name"],
                ["Quantity Sold", "quantity"],
                ["Revenue", "revenue", true],
                ["% of Gross Revenue", "percent"],
              ]}
              value={(r, k, m) =>
                k === "percent" ? (
                  <span className="report-share">
                    <span>
                      {grossTotal
                        ? ((r.revenue / grossTotal) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                    <i
                      style={{
                        width: `${grossTotal ? (r.revenue / grossTotal) * 100 : 0}%`,
                      }}
                    />
                  </span>
                ) : m ? (
                  formatCurrency(r[k])
                ) : (
                  r[k]
                )
              }
            />
            <article className="panel report-card">
              <Heading
                title="Expense Breakdown"
                sub="Selected-period business expenses"
              />
              {rows(data.expenseCategories).length ? (
                <div className="report-expense-bars">
                  {data.expenseCategories.map((r, i) => (
                    <div key={r._id || r.name}>
                      <span>
                        <i style={{ background: colors[i % colors.length] }} />
                        {r.name || "Uncategorised"}
                      </span>
                      <strong>{formatCurrency(r.amount)}</strong>
                      <small>
                        {summary.expenses
                          ? ((r.amount / summary.expenses) * 100).toFixed(1)
                          : 0}
                        %
                      </small>
                      <em>
                        <i
                          style={{
                            width: `${summary.expenses ? (r.amount / summary.expenses) * 100 : 0}%`,
                          }}
                        />
                      </em>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty text="No expenses recorded for this period." />
              )}
            </article>
          </section>
          <Table
            id="report-products"
            title="Product Sales"
            sub="Gross revenue before bill discounts and tax. Product-level discount and net allocations are unavailable."
            controls={
              <select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="revenue">Sort: revenue</option>
                <option value="quantity">Sort: quantity</option>
                <option value="name">Sort: product name</option>
              </select>
            }
            rows={products}
            visibleLimit={showAll ? products.length : 10}
            footer={
              products.length > 10 && (
                <button
                  className="button secondary"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll
                    ? "Show First 10"
                    : `View All ${products.length} Products`}
                </button>
              )
            }
            cols={[
              ["Product", "name"],
              ["Category", "categoryName"],
              ["Qty Sold", "quantity"],
              ["Gross Sales", "revenue", true],
            ]}
            value={(r, k, m) =>
              m ? formatCurrency(r[k]) : r[k] || "Uncategorised"
            }
          />
          <Table
            title="Cashier Performance"
            sub="Completed sales only. Gross includes tax and rounding; net is after discounts."
            rows={rows(data.cashiers)}
            cols={[
              ["Cashier", "name"],
              ["Orders", "orders"],
              ["Gross Sales", "gross", true],
              ["Discounts", "discount", true],
              ["Net Sales", "sales", true],
              ["Average Bill", "averageBill", true],
            ]}
            value={(r, k, m) => (m ? formatCurrency(r[k]) : r[k])}
          />
          {(topProduct || topCategory || peak?.sales || topPayment?.amount) && (
            <section className="panel report-card business-summary">
              <Heading
                title="Business Summary"
                sub="Calculated from the selected period"
              />
              <div>
                {topProduct && (
                  <Insight
                    icon={Package}
                    label="Best Selling Product"
                    value={topProduct.name}
                  />
                )}{" "}
                {topCategory && (
                  <Insight
                    icon={BarChart3}
                    label="Top Category"
                    value={topCategory.name}
                  />
                )}{" "}
                {peak?.sales > 0 && (
                  <Insight
                    icon={TrendingUp}
                    label={days === 1 ? "Peak Sales Hour" : "Best Sales Day"}
                    value={peak.label}
                  />
                )}{" "}
                {topPayment?.amount > 0 && (
                  <Insight
                    icon={WalletCards}
                    label="Leading Payment by Amount"
                    value={
                      topPayment.name === "UPI" ? "UPI / GPay" : topPayment.name
                    }
                  />
                )}
              </div>
            </section>
          )}
          <p className="report-data-note">
            Completed orders only. Product, category and cashier reports include
            up to 500 groups. Payment breakdown shows Cash, UPI and Card
            allocations; historical methods outside these are excluded. All
            dates use India Standard Time.
          </p>
        </>
      )}
    </div>
  );
}
function DateField({ label, value, disabled, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function Kpi({ icon: Icon, label, value, note }) {
  return (
    <article className="report-kpi">
      <span>
        <Icon size={17} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {note && <em>{note}</em>}
      </div>
    </article>
  );
}
function Heading({ title, sub }) {
  return (
    <header className="report-card-heading">
      <h2>{title}</h2>
      <p>{sub}</p>
    </header>
  );
}
function SalesChart({ data }) {
  return (
    <div className="report-main-chart">
      <ResponsiveContainer>
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid stroke="#edf0e9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              dateLabel.format(new Date(`${v}T12:00:00+05:30`))
            }
            fontSize={10}
          />
          <YAxis fontSize={10} width={46} tickFormatter={(v) => `₹${v}`} />
          <Tooltip
            labelFormatter={(v, payload) => {
              const row = payload?.[0]?.payload;
              return row?.from
                ? `${row.from} – ${row.to}`
                : dateLabel.format(new Date(`${v}T12:00:00+05:30`));
            }}
            formatter={(v, n) => [formatCurrency(v), n]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="sales"
            name="Sales"
            fill="#285a3e"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            isAnimationActive={false}
            dataKey="expenses"
            name="Expenses"
            fill="#9aaa8c"
            radius={[4, 4, 0, 0]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
function Empty({ text }) {
  return (
    <div className="report-empty">
      <BarChart3 size={22} />
      <p>{text}</p>
    </div>
  );
}
function Table({
  id,
  title,
  sub,
  rows,
  cols,
  value,
  controls,
  footer,
  visibleLimit = rows.length,
}) {
  return (
    <section id={id} className="panel report-card report-table">
      <Heading title={title} sub={sub} />
      {controls && <div className="report-table-control">{controls}</div>}
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {cols.map(([l]) => (
                  <th key={l}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr
                  key={r._id || r.name}
                  className={
                    index >= visibleLimit ? "report-print-row" : undefined
                  }
                >
                  {cols.map(([, k, m]) => (
                    <td key={k}>{value(r, k, m)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="No data available for this period." />
      )}
      {footer && <footer className="report-table-footer">{footer}</footer>}
    </section>
  );
}
function Insight({ icon: Icon, label, value }) {
  return (
    <article>
      <Icon size={17} />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </article>
  );
}
function Skeleton() {
  return (
    <div className="reports-skeleton" role="status" aria-label="Loading report">
      <span className="sr-only">Loading report</span>
      <div className="report-kpis">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div>
        <i />
        <i />
      </div>
      <i />
    </div>
  );
}
