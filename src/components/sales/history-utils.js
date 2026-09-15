import { businessDate } from "../../lib/dates.js";
import { shiftDate } from "../dashboard/period.js";
export const statusLabel = (status) =>
  ({ COMPLETED: "Paid", CANCELLED: "Cancelled / Void", REFUNDED: "Refunded" })[
    status
  ] || status;
export function salesRange(preset, today = businessDate()) {
  const month = `${today.slice(0, 7)}-01`;
  if (preset === "yesterday") {
    const day = shiftDate(today, -1);
    return { from: day, to: day };
  }
  if (preset === "7") return { from: shiftDate(today, -6), to: today };
  if (preset === "month") return { from: month, to: today };
  if (preset === "last-month") {
    const end = shiftDate(month, -1);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  return { from: today, to: today };
}
export function saleDate(value, time = false) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(time
      ? { hour: "numeric", minute: "2-digit" }
      : { day: "numeric", month: "short", year: "numeric" }),
  }).format(new Date(value));
}
