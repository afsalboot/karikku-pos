import test from "node:test";
import assert from "node:assert/strict";
import {
  reportRange,
  reportPayments,
  reportTimeline,
  reportHours,
  reportCsv,
} from "../src/lib/report-presentation.js";
test("report presets preserve IST calendar dates across year and leap boundaries", () => {
  assert.deepEqual(reportRange("lastMonth", "2024-03-15"), {
    from: "2024-02-01",
    to: "2024-02-29",
  });
  assert.deepEqual(reportRange("lastWeek", "2026-01-01"), {
    from: "2025-12-22",
    to: "2025-12-28",
  });
  assert.deepEqual(reportRange("yesterday", "2026-01-01"), {
    from: "2025-12-31",
    to: "2025-12-31",
  });
});
test("displayed payment shares exclude legacy methods without duplicating allocations", () => {
  const payments = reportPayments([
    { _id: "Cash", total: 200 },
    { _id: "UPI", total: 300 },
    { _id: "Other", total: 100 },
  ]);
  assert.deepEqual(
    payments.map((r) => r.amount),
    [200, 300, 0],
  );
  assert.deepEqual(
    payments.map((r) => r.percent),
    [40, 60, 0],
  );
  assert.equal(reportPayments([])[0].percent, 0);
});
test("hourly presentation includes midnight and late sales; grouping preserves totals", () => {
  assert.equal(reportHours([{ _id: 23, sales: 600 }])[23].sales, 600);
  assert.equal(reportHours()[0].label, "12 AM");
  const daily = Array.from({ length: 200 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
    sales: 100,
    expenses: 20,
  }));
  for (const count of [31, 90, 200]) {
    const grouped = reportTimeline(daily.slice(0, count));
    assert.equal(
      grouped.reduce((sum, r) => sum + r.sales, 0),
      count * 100,
    );
    assert.equal(
      grouped.reduce((sum, r) => sum + r.expenses, 0),
      count * 20,
    );
  }
});
test("CSV includes all report sections, escapes quotes and neutralizes spreadsheet formulas", () => {
  const csv = reportCsv(
    {
      summary: { sales: 100 },
      daily: [],
      products: [{ name: '=HYPERLINK("x")', revenue: 100 }],
      payments: [],
      categories: [],
      cashiers: [],
      expenseCategories: [],
    },
    { from: "2026-09-01", to: "2026-09-14" },
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'="));
  assert.ok(csv.includes('""x""'));
  assert.ok(csv.includes("Cashier"));
  assert.ok(csv.includes("Expense Category"));
});
