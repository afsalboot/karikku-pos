import { cents, money } from "./calculations.js";
export const saleMethods = ["Cash", "UPI", "Card"];
export const paymentLabel = (method) =>
  method === "UPI" ? "GPay / UPI" : method;
export const salePayments = (sale) =>
  sale.payments?.length
    ? sale.payments
    : [{ method: sale.paymentMethod, amount: sale.total }];
export function normalizePayment(input, total, enabled = saleMethods) {
  const split = input.paymentMethod === "Split";
  if (!split && !saleMethods.includes(input.paymentMethod))
    throw new Error("Choose Cash, GPay / UPI or Card");
  if (!split && input.payments !== undefined)
    throw new Error("Payment allocations require split payment");
  const rows = split
    ? input.payments
    : [{ method: input.paymentMethod, amount: total }];
  if (!rows?.length || rows.length > 3 || (split && rows.length < 2))
    throw new Error("Select at least two split payment methods");
  if (new Set(rows.map((p) => p.method)).size !== rows.length)
    throw new Error("Use each payment method only once");
  for (const row of rows) {
    if (!saleMethods.includes(row.method) || !enabled.includes(row.method))
      throw new Error("This payment method is disabled");
    if (
      !Number.isFinite(row.amount) ||
      row.amount < 0 ||
      row.amount > 100000000 ||
      Math.abs(row.amount * 100 - cents(row.amount)) > 0.000001 ||
      (split && row.amount === 0)
    )
      throw new Error(
        "Enter a positive payment amount with at most two decimals",
      );
  }
  const paid = rows.reduce((sum, row) => sum + cents(row.amount), 0);
  if (paid !== cents(total))
    throw new Error(
      paid > cents(total)
        ? "Split payment exceeds the amount due."
        : "Split payment does not cover the amount due.",
    );
  const cash = rows.find((p) => p.method === "Cash");
  if (!cash && input.cashReceived !== undefined)
    throw new Error("Cash received requires a cash payment");
  const cashReceived = cash ? (input.cashReceived ?? cash.amount) : undefined;
  if (
    cash &&
    (!Number.isFinite(cashReceived) ||
      cashReceived < cash.amount ||
      cashReceived > 100000000 ||
      Math.abs(cashReceived * 100 - cents(cashReceived)) > 0.000001)
  )
    throw new Error(
      "Cash received must cover the cash amount due and use at most two decimals",
    );
  return {
    paymentMethod: input.paymentMethod,
    payments: rows.map((p) => ({
      method: p.method,
      amount: money(cents(p.amount)),
    })),
    ...(cash
      ? {
          cashReceived,
          changeGiven: money(cents(cashReceived) - cents(cash.amount)),
        }
      : {}),
  };
}
// Old receipts have only paymentMethod and total. New receipts have allocations.
export const paymentUnwind = [
  {
    $set: {
      _paymentRows: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
          "$payments",
          [{ method: "$paymentMethod", amount: "$total" }],
        ],
      },
    },
  },
  { $unwind: "$_paymentRows" },
];
export const paymentGroups = [
  ...paymentUnwind,
  {
    $group: {
      _id: "$_paymentRows.method",
      total: { $sum: "$_paymentRows.amount" },
      orders: { $sum: 1 },
    },
  },
  { $set: { total: { $round: ["$total", 2] } } },
];
