const IST_TIME_ZONE = "Asia/Kolkata";

function istParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
}

export function formatInvoiceNumber({ prefix = "", format = "SEQUENCE", sequence, sequencePadding = 6, date = new Date() }) {
  const number = String(sequence).padStart(sequencePadding, "0");
  if (format === "SEQUENCE") return `${prefix}${number}`;
  const { year, month, day, hour, minute, second } = istParts(date);
  const datePart = `${year}${month}${day}`;
  if (format === "DATE_SEQUENCE") return `${prefix}${datePart}-${number}`;
  return `${prefix}${datePart}-${hour}${minute}${second}-${number}`;
}
