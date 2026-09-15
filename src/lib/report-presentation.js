const dayMs = 86400000;
const iso = (date) => new Date(date).toISOString().slice(0, 10);
export function reportRange(period, today) {
  const time = Date.parse(`${today}T00:00:00Z`);
  const shift = (days) => iso(time + days * dayMs);
  const weekday = (new Date(time).getUTCDay() + 6) % 7;
  if (period === "yesterday") return { from: shift(-1), to: shift(-1) };
  if (period === "thisWeek") return { from: shift(-weekday), to: today };
  if (period === "lastWeek")
    return { from: shift(-weekday - 7), to: shift(-weekday - 1) };
  if (period === "thisMonth")
    return { from: `${today.slice(0, 8)}01`, to: today };
  if (period === "lastMonth") {
    const to = iso(Date.parse(`${today.slice(0, 8)}01T00:00:00Z`) - dayMs);
    return { from: `${to.slice(0, 8)}01`, to };
  }
  return { from: today, to: today };
}
export function reportPayments(source = []) {
  const supported = ["Cash", "UPI", "Card"].map((name) => ({
    name,
    amount: source
      .filter((item) => item._id === name)
      .reduce((sum, item) => sum + item.total, 0),
  }));
  const total = supported.reduce((sum, item) => sum + item.amount, 0);
  return supported.map((item) => ({
    ...item,
    percent: total ? (item.amount / total) * 100 : 0,
  }));
}
export function reportTimeline(daily = []) {
  if (daily.length <= 62) return daily;
  const groups = new Map();
  for (const row of daily) {
    const time = Date.parse(`${row.date}T00:00:00Z`);
    const key =
      daily.length > 180
        ? `${row.date.slice(0, 7)}-01`
        : iso(time - ((new Date(time).getUTCDay() + 6) % 7) * dayMs);
    const group = groups.get(key) || {
      date: key,
      from: row.date,
      to: row.date,
      sales: 0,
      expenses: 0,
    };
    group.to = row.date;
    group.sales += row.sales;
    group.expenses += row.expenses;
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function reportHours(hourly = []) {
  return Array.from({ length: 24 }, (_, hour) => ({
    label: `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`,
    sales: hourly.find((item) => item._id === hour)?.sales || 0,
  }));
}
export function reportCsv(data, range) {
  const s = data.summary;
  const entries = [
    ["Karikku POS Reports"],
    ["From", range.from, "To", range.to, "Timezone", "Asia/Kolkata"],
    ["Metric", "Value"],
    ...[
      "sales",
      "expenses",
      "netEarnings",
      "orders",
      "averageBill",
      "discount",
      "tax",
    ].map((key) => [key, s[key]]),
    [],
    ["Date", "Sales", "Expenses"],
    ...data.daily.map((r) => [r.date, r.sales, r.expenses]),
    [],
    ["Payment Method", "Amount", "% of displayed payments"],
    ...reportPayments(data.payments).map((r) => [r.name, r.amount, r.percent]),
    [],
    ["Product", "Category", "Quantity", "Revenue before bill discount and tax"],
    ...data.products.map((r) => [
      r.name,
      r.categoryName,
      r.quantity,
      r.revenue,
    ]),
    [],
    ["Category", "Quantity", "Revenue before bill discount and tax"],
    ...data.categories.map((r) => [r.name, r.quantity, r.revenue]),
    [],
    ["Expense Category", "Amount"],
    ...data.expenseCategories.map((r) => [r.name, r.amount]),
    [],
    [
      "Cashier",
      "Orders",
      "Gross (including tax and rounding)",
      "Discount",
      "Net Sales",
      "Average Bill",
    ],
    ...data.cashiers.map((r) => [
      r.name,
      r.orders,
      r.gross,
      r.discount,
      r.sales,
      r.averageBill,
    ]),
    [],
    [
      "Product, category and cashier groups are limited to 500 by the report API.",
    ],
  ];
  return (
    "\uFEFF" +
    entries
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text))
              text = `'${text}`;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
