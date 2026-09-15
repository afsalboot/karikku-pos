export function filterExpenses(
  items,
  { q = "", category = "", payment = "", createdBy = "" } = {},
) {
  const search = q.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      (!category || item.categoryId === category) &&
      (!payment || item.paymentMethod === payment) &&
      (!createdBy || item.createdBy?.userId === createdBy) &&
      (!search ||
        [
          item.description,
          item.categoryName,
          item.amount,
          item.createdBy?.name,
        ].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase()
            .includes(search),
        )),
  );
}

export function summarizeExpenses(items) {
  const groups = (field) => {
    const totals = new Map();
    for (const item of items) {
      const key = item[field] || "Other";
      totals.set(key, (totals.get(key) || 0) + item.amount);
    }
    return [...totals]
      .map(([_id, amount]) => ({ _id, amount }))
      .sort((a, b) => b.amount - a.amount || a._id.localeCompare(b._id));
  };
  const amount = items.reduce((sum, item) => sum + item.amount, 0);
  const categories = groups("categoryName");
  return {
    amount,
    transactions: items.length,
    average: items.length ? amount / items.length : 0,
    topCategory: categories[0],
    categories,
    payments: groups("paymentMethod"),
  };
}

const dayMs = 86400000;
export function previousExpenseRange(range) {
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  const span = end - start + dayMs;
  return {
    from: new Date(start - span).toISOString().slice(0, 10),
    to: new Date(start - dayMs).toISOString().slice(0, 10),
  };
}

export function expenseDays(range) {
  const dates = [];
  const end = Date.parse(`${range.to}T00:00:00Z`);
  for (
    let time = Date.parse(`${range.from}T00:00:00Z`);
    time <= end;
    time += dayMs
  )
    dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}
