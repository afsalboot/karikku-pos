import test from "node:test";
import assert from "node:assert/strict";
import {
  filterExpenses,
  summarizeExpenses,
  previousExpenseRange,
  expenseDays,
} from "../src/lib/expense-insights.js";
const items = [
  {
    amount: 1250,
    categoryId: "a",
    categoryName: "Purchase",
    description: "Fruit delivery",
    paymentMethod: "Cash",
    createdBy: { userId: "u1", name: "Administrator" },
  },
  {
    amount: 250,
    categoryId: "b",
    categoryName: "Utilities",
    description: "Water",
    paymentMethod: "UPI",
    createdBy: { userId: "u2", name: "Cashier" },
  },
  {
    amount: 500,
    categoryId: "a",
    categoryName: "Purchase",
    description: "Ice",
    paymentMethod: "Card",
    createdBy: { userId: "u1", name: "Administrator" },
  },
];
test("expense totals and breakdowns use all filtered records", () => {
  const summary = summarizeExpenses(items);
  assert.equal(summary.amount, 2000);
  assert.equal(summary.transactions, 3);
  assert.equal(summary.average, 2000 / 3);
  assert.deepEqual(summary.topCategory, { _id: "Purchase", amount: 1750 });
  assert.equal(
    summary.payments.reduce((sum, row) => sum + row.amount, 0),
    2000,
  );
  assert.equal(
    summarizeExpenses(
      filterExpenses(items, {
        category: "a",
        createdBy: "u1",
        payment: "Card",
      }),
    ).amount,
    500,
  );
  assert.equal(summarizeExpenses([]).average, 0);
});
test("expense search includes amount and staff and combines filters", () => {
  assert.equal(filterExpenses(items, { q: "1250" }).length, 1);
  assert.equal(filterExpenses(items, { q: " administrator " }).length, 2);
  assert.equal(
    filterExpenses(items, { q: "purchase", payment: "UPI" }).length,
    0,
  );
  assert.equal(filterExpenses(items, { q: "WATER" })[0].amount, 250);
});
test("expense comparison uses equal inclusive periods across month boundaries", () => {
  assert.deepEqual(
    previousExpenseRange({ from: "2026-09-01", to: "2026-09-14" }),
    { from: "2026-08-18", to: "2026-08-31" },
  );
  assert.deepEqual(
    previousExpenseRange({ from: "2024-03-01", to: "2024-03-01" }),
    { from: "2024-02-29", to: "2024-02-29" },
  );
  assert.deepEqual(expenseDays({ from: "2024-02-28", to: "2024-03-01" }), [
    "2024-02-28",
    "2024-02-29",
    "2024-03-01",
  ]);
});
