export function normalizePhone(value) {
  const digits = value.replace(/[\s()+-]/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits;
}
