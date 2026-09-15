export const businessDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export function dateBounds(from, to) {
  const start = from || businessDate();
  const end = to || start;
  if (
    ![start, end].every(
      (s) =>
        /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
    ) ||
    start > end
  )
    throw Object.assign(new Error("Choose a valid date range"), {
      status: 400,
    });
  const $gte = new Date(`${start}T00:00:00+05:30`);
  const $lt = new Date(new Date(`${end}T00:00:00+05:30`).getTime() + 86400000);
  if ($lt - $gte > 366 * 86400000)
    throw Object.assign(new Error("Date range must be within one year"), {
      status: 400,
    });
  return { $gte, $lt };
}
