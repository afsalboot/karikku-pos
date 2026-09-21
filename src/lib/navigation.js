const sections = new Set([
  "dashboard",
  "pos",
  "sales",
  "products",
  "customers",
  "expenses",
  "reports",
  "day-closing",
  "users",
  "settings",
  "account",
]);

// Keep only known read-only destinations. Never carry action queries or user data.
export function safeReturnPath(value, fallback = "/pos") {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    !value.startsWith("/") ||
    /[\\%?#\s]/.test(value)
  )
    return fallback;
  const parts = value.slice(1).split("/");
  if (parts.length === 1 && sections.has(parts[0])) return value;
  if (
    parts.length === 2 &&
    parts[0] === "sales" &&
    /^[a-f0-9]{24}$/i.test(parts[1])
  )
    return value;
  return fallback;
}

export function canAccessSection(role, section, settings = {}) {
  return (
    role === "ADMIN" ||
    ["pos", "sales", "account"].includes(section) ||
    (section === "expenses" && settings.allowCashierExpenses === true) ||
    (section === "day-closing" && settings.allowCashierDayClosing === true)
  );
}
