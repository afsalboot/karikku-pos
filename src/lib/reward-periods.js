import { businessDate } from "./dates.js";
export function birthdayEligible(customer, birthday, now = new Date()) {
  if (!customer.dateOfBirth) return false;
  const today = businessDate(now), birth = new Date(customer.dateOfBirth).toISOString().slice(0,10);
  const year = Number(today.slice(0,4));
  if (customer.loyalty?.birthdayRewardUsedYear === year) return false;
  if (birthday.availability === "DAY") return today.slice(5) === birth.slice(5);
  if (birthday.availability === "MONTH") return today.slice(5,7) === birth.slice(5,7);
  // Birthday week is the birthday plus the following six days in IST.
  return [year, year - 1].some(y => { const days = (Date.parse(today) - Date.parse(`${y}-${birth.slice(5)}`)) / 86400000; return days >= 0 && days < 7; });
}
