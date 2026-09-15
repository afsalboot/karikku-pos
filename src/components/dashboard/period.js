import { businessDate, dateBounds } from "../../lib/dates.js";

export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function periodRange(period, today = businessDate()) {
  return {
    from: shiftDate(today, period === "7" ? -6 : period === "30" ? -29 : 0),
    to: today,
  };
}
export function previousRange(range) {
  const bounds = dateBounds(range.from, range.to);
  const days = (bounds.$lt - bounds.$gte) / 86400000;
  return { from: shiftDate(range.from, -days), to: shiftDate(range.from, -1) };
}
export function comparison(current, previous, percent = false) {
  const delta = current - previous;
  return {
    delta,
    value: percent
      ? previous
        ? (delta / previous) * 100
        : current === 0
          ? 0
          : null
      : delta,
  };
}
export function hourlySeries(rows) {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`,
    sales: rows.find((row) => row._id === hour)?.sales || 0,
    orders: rows.find((row) => row._id === hour)?.orders || 0,
  }));
}
