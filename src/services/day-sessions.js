import DaySession from "../models/DaySession.js";
import Sale from "../models/Sale.js";
import Expense from "../models/Expense.js";
import { requireUser, fail } from "../lib/auth.js";
import { body, ok, pagination } from "../lib/http.js";
import { sessionSchema } from "../lib/validation.js";
import { businessDate } from "../lib/dates.js";
import { cents, money } from "../lib/calculations.js";
import { getSettings, transaction } from "./settings.js";
import { paymentUnwind, paymentGroups } from "../lib/payments.js";
import { historyFilter } from "../lib/day-closing.js";

async function sessionPayments(day, session) {
  const paymentBreakdown = await Sale.aggregate([
    { $match: { daySessionId: day._id, status: "COMPLETED" } },
    { $group: { _id: "$paymentMethod", total: { $sum: "$total" } } },
    { $set: { total: { $round: ["$total", 2] } } },
  ]).session(session || null);
  return {
    paymentBreakdown,
    totalSales: money(
      paymentBreakdown.reduce((sum, item) => sum + cents(item.total), 0),
    ),
  };
}
export async function cashSummary(day, session) {
  const sales = await Sale.aggregate([
    {
      $match: {
        daySessionId: day._id,
        status: "COMPLETED",
      },
    },
    ...paymentUnwind,
    { $match: { "_paymentRows.method": "Cash" } },
    { $group: { _id: null, amount: { $sum: "$_paymentRows.amount" } } },
  ]).session(session || null);
  const expenses = await Expense.aggregate([
    {
      $match: { daySessionId: day._id, deletedAt: null, paymentMethod: "Cash" },
    },
    { $group: { _id: null, amount: { $sum: "$amount" } } },
  ]).session(session || null);
  const refunds = await Sale.aggregate([
    {
      $match: {
        statusChangedSessionId: day._id,
        daySessionId: { $ne: day._id },
        status: { $in: ["REFUNDED", "CANCELLED"] },
      },
    },
    ...paymentUnwind,
    { $match: { "_paymentRows.method": "Cash" } },
    { $group: { _id: null, amount: { $sum: "$_paymentRows.amount" } } },
  ]).session(session || null);
  const cashSales = money(cents(sales[0]?.amount || 0)),
    cashExpenses = money(cents(expenses[0]?.amount || 0)),
    cashRefunds = money(cents(refunds[0]?.amount || 0));
  return {
    cashSales,
    cashExpenses,
    cashRefunds,
    expectedCash: money(
      cents(day.openingCash) +
        cents(cashSales) -
        cents(cashExpenses) -
        cents(cashRefunds),
    ),
  };
}
export async function daySessions(request) {
  const user = await requireUser();
  const settings = await getSettings();
  if (user.role !== "ADMIN" && !settings.allowCashierDayClosing)
    fail(403, "Day opening and closing is disabled for cashiers");
  if (request.method === "GET") {
    const url = new URL(request.url);
    const { page, limit, skip } = pagination(url);
    let filter;
    try {
      filter = historyFilter(url.searchParams);
    } catch (error) {
      fail(400, error.message);
    }
    const [current, items, total] = await Promise.all([
      DaySession.findOne({ status: "OPEN" }).lean(),
      DaySession.find(filter)
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DaySession.countDocuments(filter),
    ]);
    const paymentBreakdown = current
      ? await Sale.aggregate([
          { $match: { daySessionId: current._id, status: "COMPLETED" } },
          ...paymentGroups,
        ])
      : [];
    return ok({
      current: current
        ? {
            ...current,
            ...(await cashSummary(current)),
            payments: paymentBreakdown,
            ...(await sessionPayments(current)),
          }
        : null,
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  }
  const input = sessionSchema.parse(await body(request));
  const result = await transaction(async (session, settings) => {
    if (user.role !== "ADMIN" && !settings.allowCashierDayClosing)
      fail(403, "Day opening and closing is disabled for cashiers");
    const current = await DaySession.findOne({ status: "OPEN" }).session(
      session,
    );
    if (input.action === "open") {
      if (current) fail(409, "A business day is already open");
      return (
        await DaySession.create(
          [
            {
              businessDate: businessDate(),
              openingCash: input.openingCash,
              openedBy: { userId: user._id, name: user.name },
              openedAt: new Date(),
            },
          ],
          { session },
        )
      )[0].toObject();
    }
    if (!current || String(current._id) !== input.sessionId)
      fail(409, "This business day is no longer open");
    const totals = await cashSummary(current, session);
    if (![current.openingCash, totals.cashSales, totals.cashExpenses, totals.cashRefunds, totals.expectedCash].every(Number.isFinite))
      fail(400, "Session cash data is invalid. Review the session before closing.");
    if (
      input.expectedCash !== undefined &&
      cents(input.expectedCash) !== cents(totals.expectedCash)
    )
      fail(
        409,
        "Drawer totals changed. Refresh the session and review the cash count before closing.",
      );
    const difference = money(
      cents(input.actualCash) - cents(totals.expectedCash),
    );
    if (difference !== 0 && !input.differenceReason)
      fail(400, "Choose a reason for the cash difference");
    Object.assign(current, totals, {
      ...(await sessionPayments(current, session)),
      actualCash: input.actualCash,
      difference,
      differenceReason: input.differenceReason || "",
      closingNote: input.closingNote || "",
      denominationCount: input.denominationCount,
      status: "CLOSED",
      closedBy: { userId: user._id, name: user.name },
      closedAt: new Date(),
    });
    await current.save({ session });
    return current.toObject();
  });
  return ok(
    result,
    input.action === "open" ? "Business day opened" : "Business day closed",
  );
}
