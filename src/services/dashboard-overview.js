import DaySession from "../models/DaySession.js";
import Sale from "../models/Sale.js";
import Expense from "../models/Expense.js";
import { cashSummary } from "./day-sessions.js";
import { paymentGroups } from "../lib/payments.js";

// Operational totals follow the actual session, not the dashboard date filter.
export async function dashboardClosing() {
  const current = await DaySession.findOne({ status: "OPEN" }).lean();
  if (!current) {
    return DaySession.findOne({ status: "CLOSED" })
      .sort({ closedAt: -1 })
      .lean();
  }
  const [cash, payments, expenses] = await Promise.all([
    cashSummary(current),
    Sale.aggregate([
      { $match: { daySessionId: current._id, status: "COMPLETED" } },
      ...paymentGroups,
    ]),
    Expense.aggregate([
      { $match: { daySessionId: current._id, deletedAt: null } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  return {
    ...current,
    ...cash,
    payments,
    totalSales: payments.reduce((sum, item) => sum + item.total, 0),
    expenses: expenses[0]?.total || 0,
  };
}
