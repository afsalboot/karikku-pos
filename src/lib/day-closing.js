import { cents, money } from "./calculations.js";

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
      day.expectedCash,
      day.totalSales,
    ].every(Number.isFinite) &&
    cents(day.expectedCash) ===
      cents(day.openingCash) +
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
    ].map((key) => ({ [key]: regex }));
  }
  return filter;
}
