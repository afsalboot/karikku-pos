"use client";
import { useState } from "react";
import { Banknote, TrendingUp, ReceiptText, WalletCards } from "lucide-react";
import { useAuth } from "@/components/layout/app-shell";
import { useData } from "@/hooks/useData";
import { formatCurrency as currency } from "@/lib/client";
import { businessDate } from "@/lib/dates";
import DashboardHeader from "./dashboard-header";
import {
  StatCard,
  TopSellingProducts,
  RecentSales,
  ExpenseOverview,
  DayClosingCard,
  DashboardSkeleton,
} from "./dashboard-cards";
import {
  SalesPerformanceChart,
  PaymentMethodChart,
  paymentRows,
} from "./dashboard-charts";
import { periodRange, previousRange, comparison } from "./period";

function Comparison({ current, previous, percent, count, label }) {
  if (previous === undefined)
    return <span className="dash-muted">Comparison unavailable</span>;
  const { delta, value } = comparison(current, previous, percent);
  return (
    <span
      className={
        delta > 0 ? "dash-positive" : delta < 0 ? "dash-negative" : "dash-muted"
      }
    >
      {delta > 0 ? "↑ " : delta < 0 ? "↓ " : ""}
      {value === null
        ? "No previous sales"
        : `${count ? Math.abs(value).toLocaleString("en-IN") : percent ? `${Math.abs(value).toFixed(1)}%` : currency(Math.abs(value))} ${label}`}
    </span>
  );
}
export default function DashboardWorkspace() {
  const { user } = useAuth();
  const [period, setPeriod] = useState("today");
  const [range, setRange] = useState(() => periodRange("today"));
  const result = useData(`/dashboard?${new URLSearchParams(range)}`);
  const previous = useData(
    `/reports?${new URLSearchParams(previousRange(range))}`,
  );
  const today = period === "today";
  function onPeriod(value) {
    setPeriod(value);
    if (value !== "custom") setRange(periodRange(value));
  }
  function refresh() {
    if (period !== "custom" && range.to !== businessDate())
      setRange(periodRange(period));
    result.refresh();
    previous.refresh();
  }
  const data = result.data;
  const summary = data?.summary;
  const prev = previous.data?.summary;
  const comparisonLabel = today ? "vs yesterday" : "vs previous period";
  const payments = paymentRows(data?.payments || []);
  return (
    <div className="dashboard-workspace">
      <DashboardHeader
        user={user}
        period={period}
        range={range}
        onPeriod={onPeriod}
        onRange={setRange}
        onRefresh={refresh}
        loading={result.loading || previous.loading}
      />
      {result.loading ? (
        <DashboardSkeleton />
      ) : result.error ? (
        <div className="error-panel" role="alert">
          <p>{result.error}</p>
          <button className="button secondary" onClick={refresh}>
            Try again
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="dash-primary-grid">
              <StatCard
                label={today ? "Today's Sales" : "Total Sales"}
                value={currency(summary.sales)}
                icon={Banknote}
              >
                <Comparison
                  current={summary.sales}
                  previous={prev?.sales}
                  percent
                  label={comparisonLabel}
                />
              </StatCard>
              <StatCard
                label="Net Earnings"
                value={currency(summary.netEarnings)}
                icon={TrendingUp}
              >
                <span className="dash-muted">
                  Sales {currency(summary.sales)} − Expenses{" "}
                  {currency(summary.expenses)}
                </span>
              </StatCard>
              <StatCard
                label={today ? "Today's Orders" : "Total Orders"}
                value={summary.orders.toLocaleString("en-IN")}
                icon={ReceiptText}
              >
                <Comparison
                  current={summary.orders}
                  previous={prev?.orders}
                  count
                  label={comparisonLabel}
                />
              </StatCard>
              <StatCard
                label="Average Bill"
                value={currency(summary.averageBill)}
                icon={WalletCards}
              >
                <Comparison
                  current={summary.averageBill}
                  previous={prev?.averageBill}
                  label={comparisonLabel}
                />
              </StatCard>
            </div>
            <div className="dash-secondary-grid">
              <StatCard
                compact
                label={today ? "Today's Expenses" : "Total Expenses"}
                value={currency(summary.expenses)}
              />
              {payments.slice(0, 2).map((row) => (
                <StatCard
                  compact
                  key={row.name}
                  label={`${row.name} Sales`}
                  value={currency(row.total)}
                />
              ))}
              <StatCard
                compact
                label="Card / Other"
                value={currency(payments[2].total + payments[3].total)}
              />
            </div>
            {previous.error && (
              <p className="dash-muted" role="status">
                Previous-period comparison could not load.{" "}
                <button className="text-button" onClick={previous.refresh}>
                  Retry comparison
                </button>
              </p>
            )}
            <h2 className="dash-section-title">Business Overview</h2>
            <div className="dash-overview-grid">
              <SalesPerformanceChart data={data} today={today} />
              <PaymentMethodChart payments={data.payments} />
            </div>
            <div className="dash-two-column">
              <TopSellingProducts products={data.products} />
              <RecentSales sales={data.recent} />
            </div>
            <div className="dash-two-column">
              <ExpenseOverview
                categories={data.expenseCategories}
                total={summary.expenses}
                today={today}
              />
              <DayClosingCard day={data.closing} />
            </div>
          </>
        )
      )}
    </div>
  );
}
