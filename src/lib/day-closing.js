import { cents, money } from "./calculations.js";
export const denominations = [500, 200, 100, 50, 20, 10];
export const movementCategories = {
  IN: ["Float Added", "External Cash Added", "Cash Correction"],
  OUT: ["Cash Removed", "Bank Deposit", "Petty Cash Withdrawal", "Owner Withdrawal", "Cash Correction"],
};
export const differenceReasons = ["Counting Error", "Unrecorded Cash Sale", "Unrecorded Cash Expense", "Change / Rounding Difference", "Opening Cash Error", "Other"];
export const denominationTotal = (counts) => money(denominations.reduce((sum, d) => sum + d * 100 * Number(counts[d] || 0), 0) + cents(Number(counts.coins || 0)));
export const reconciliationState = (day) => day.expectedCash < 0 ? "NEEDS_REVIEW" : !day.difference ? "BALANCED" : day.difference < 0 ? "SHORT" : "OVER";

export function validCash(value) {
  return (
    value !== "" &&
    /^\d+(\.\d{0,2})?$/.test(String(value)) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 1000000
  );
}
export const cashDifference = (actual, expected) =>
  money(cents(Number(actual)) - cents(expected));
export function validSession(day) {
  return Boolean(
    day?._id &&
    day.status === "OPEN" &&
    Number.isFinite(Date.parse(day.openedAt)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(day.businessDate) &&
    [
      day.openingCash,
      day.cashSales,
      day.cashExpenses,
      day.cashRefunds ?? 0,
      day.cashIn ?? 0,
      day.cashOut ?? 0,
      day.expectedCash,
      day.totalSales,
    ].every(Number.isFinite) &&
    cents(day.expectedCash) ===
      cents(day.openingCash) +
        cents(day.cashIn ?? 0) - cents(day.cashOut ?? 0) +
        cents(day.cashSales) -
        cents(day.cashExpenses) -
        cents(day.cashRefunds ?? 0),
  );
}
export function historyFilter(params) {
  const filter = { status: "CLOSED" };
  const from = params.get("from"),
    to = params.get("to");
  for (const date of [from, to])
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error("Choose a valid date range");
  if (from && to && from > to)
    throw new Error("Start date must be before end date");
  if (from || to)
    filter.businessDate = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  const status = params.get("balance");
  if (status === "balanced") filter.difference = 0;
  if (status === "short") filter.difference = { $lt: 0 };
  if (status === "over") filter.difference = { $gt: 0 };
  if (["balanced", "short", "over"].includes(status)) filter.expectedCash = { $gte: 0 };
  if (status === "review") filter.expectedCash = { $lt: 0 };
  const search = params.get("search")?.trim().slice(0, 100);
  if (search) {
    const regex = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
    filter.$or = [
      "openedBy.name",
      "closedBy.name",
      "closingNote",
      "differenceReason",
      "differenceDescription",
      "sessionCode",
    ].map((key) => ({ [key]: regex }));
  }
  return filter;
}
