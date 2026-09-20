import DaySession from "../models/DaySession.js";
import { createHash } from "node:crypto";
import CashMovement from "../models/CashMovement.js";
import Sale from "../models/Sale.js";
import Expense from "../models/Expense.js";
import { requireUser, fail } from "../lib/auth.js";
import { body, ok, pagination } from "../lib/http.js";
import { sessionSchema } from "../lib/validation.js";
import { businessDate } from "../lib/dates.js";
import { cents, money } from "../lib/calculations.js";
import { getSettings, transaction } from "./settings.js";
import { paymentUnwind, paymentGroups } from "../lib/payments.js";
import { historyFilter, denominationTotal, movementCategories, differenceReasons, reconciliationState } from "../lib/day-closing.js";
function reviewToken(day) {
  return createHash("sha256").update(JSON.stringify([String(day._id), day.openingCash, day.cashSales, day.cashExpenses, day.cashRefunds, day.cashIn, day.cashOut, day.expectedCash, day.totalSales, [...day.paymentBreakdown].sort((a, b) => a._id.localeCompare(b._id)).map(p => [p._id, p.total, p.orders])])).digest("hex");
}

async function sessionPayments(day, session) {
  const paymentBreakdown = await Sale.aggregate([
    { $match: { daySessionId: day._id, status: "COMPLETED" } },
    ...paymentGroups,
  ]).session(session || null);
  return {
    paymentBreakdown: paymentBreakdown.map(({ _id, total }) => ({ _id, total })),
    totalSales: money(
      paymentBreakdown.reduce((sum, item) => sum + cents(item.total), 0),
    ),
  };
}
export async function cashSummary(day, session) {
  const movements = await CashMovement.aggregate([
    { $match: { daySessionId: day._id } },
    { $group: { _id: "$type", amount: { $sum: "$amount" } } },
  ]).session(session || null);
  const cashIn = money(cents(movements.find(m => m._id === "IN")?.amount || 0));
  const cashOut = money(cents(movements.find(m => m._id === "OUT")?.amount || 0));
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
    cashIn,
    cashOut,
    expectedCash: money(
      cents(day.openingCash) +
        cents(cashIn) - cents(cashOut) +
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
    const detailId = url.searchParams.get("sessionId");
    if (detailId) {
      if (!/^[a-f0-9]{24}$/i.test(detailId)) fail(400, "Invalid session identifier");
      const day = await DaySession.findById(detailId).lean();
      if (!day) fail(404, "Session not found");
      return ok({ ...day, movements: await CashMovement.find({ daySessionId: day._id }).sort({ createdAt: 1 }).lean() });
    }
    const { page, limit, skip } = pagination(url);
    let filter;
    try {
      filter = historyFilter(url.searchParams);
    } catch (error) {
      fail(400, error.message);
    }
    const [current, items, total, previous] = await Promise.all([
      DaySession.findOne({ status: "OPEN" }).lean(),
      DaySession.find(filter)
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DaySession.countDocuments(filter),
      DaySession.findOne({ status: "CLOSED" }).sort({ closedAt: -1 }).lean(),
    ]);
    const paymentBreakdown = current
      ? await Sale.aggregate([
          { $match: { daySessionId: current._id, status: "COMPLETED" } },
          ...paymentGroups,
        ])
      : [];
    const active = current ? { ...current, ...(await cashSummary(current)), payments: paymentBreakdown, ...(await sessionPayments(current)), movements: await CashMovement.find({ daySessionId: current._id }).sort({ createdAt: 1 }).lean() } : null;
    if (active) {
      active.reviewToken = reviewToken(active);
      active.reconciliationState = active.expectedCash < 0 ? "NEEDS_REVIEW" : "PENDING_COUNT";
    }
    return ok({
      previous,
      current: active,
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
      const previous = await DaySession.findOne({ status: "CLOSED" }).sort({ closedAt: -1 }).session(session).lean();
      const hasFloat = Number.isFinite(previous?.closingFloat);
      const adjusted = hasFloat && cents(input.openingCash) !== cents(previous.closingFloat);
      if (adjusted && !input.openingAdjustmentReason) fail(400, "Explain why opening cash differs from the previous closing float");
      const date = businessDate();
      const count = await DaySession.countDocuments({ businessDate: date }).session(session);
      const latest = await DaySession.findOne({ businessDate: date }).sort({ sessionNumber: -1 }).session(session).lean();
      const sessionNumber = Math.max(count, latest?.sessionNumber || 0) + 1;
      return (
        await DaySession.create(
          [
            {
              businessDate: date,
              sessionNumber,
              sessionCode: `${date.replaceAll("-", "")}-${String(sessionNumber).padStart(2, "0")}`,
              openingSource: adjusted ? "ADJUSTED" : hasFloat ? "PREVIOUS_FLOAT" : "MANUAL",
              openingAdjustmentReason: input.openingAdjustmentReason || "",
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
    if (input.action === "movement") {
      if (!movementCategories[input.type].includes(input.category)) fail(400, "Choose a valid cash movement category");
      const duplicate = await CashMovement.findOne({ requestId: input.requestId }).session(session).lean();
      if (duplicate) {
        if (String(duplicate.daySessionId) !== input.sessionId || duplicate.type !== input.type || cents(duplicate.amount) !== cents(input.amount) || duplicate.category !== input.category || duplicate.note !== input.note || String(duplicate.createdBy.userId) !== String(user._id)) fail(409, "This request was already used for a different movement");
        return duplicate;
      }
      const { action: _action, sessionId: _sessionId, ...movement } = input;
      return (await CashMovement.create([{ ...movement, daySessionId: current._id, createdBy: { userId: user._id, name: user.name } }], { session }))[0].toObject();
    }
    const totals = await cashSummary(current, session);
    const payments = await sessionPayments(current, session);
    if (input.reviewToken && input.reviewToken !== reviewToken({ ...current.toObject(), ...totals, ...payments })) fail(409, "Drawer totals changed. Refresh the session and review the cash count before closing.");
    if (![current.openingCash, ...Object.values(totals)].every(Number.isFinite))
      fail(400, "Session cash data is invalid. Review the session before closing.");
    if (
      input.expectedCash !== undefined &&
      cents(input.expectedCash) !== cents(totals.expectedCash)
    )
      fail(
        409,
        "Drawer totals changed. Refresh the session and review the cash count before closing.",
      );
    if (totals.expectedCash < 0) fail(409, "Invalid drawer balance — review required. Correct cash records or record missing cash in before closing.");
    if (input.cashRemovedAtClosing > input.actualCash) fail(400, "Cash removed cannot exceed actual counted cash");
    const closingFloat = money(cents(input.actualCash) - cents(input.cashRemovedAtClosing));
    if (input.closingFloat !== undefined && cents(input.closingFloat) !== cents(closingFloat)) fail(400, "Closing float must equal actual cash minus cash removed");
    if (input.denominationBreakdown && cents(denominationTotal(input.denominationBreakdown)) !== cents(input.actualCash)) fail(400, "Denomination count must equal actual counted cash");
    if (input.denominationCount !== undefined && cents(input.denominationCount) !== cents(input.actualCash)) fail(400, "Denomination total must equal actual counted cash");
    const difference = money(
      cents(input.actualCash) - cents(totals.expectedCash),
    );
    if (difference !== 0 && !input.differenceReason)
      fail(400, "Choose a reason for the cash difference");
    if (difference !== 0 && !differenceReasons.includes(input.differenceReason)) fail(400, "Choose a valid difference reason; record drawer movements separately");
    if (difference !== 0 && input.differenceReason === "Other" && !input.differenceDescription) fail(400, "Describe the cash difference");
    Object.assign(current, totals, {
      ...payments,
      actualCash: input.actualCash,
      difference,
      reconciliationState: reconciliationState({ ...totals, difference }),
      differenceDescription: difference ? input.differenceDescription || "" : "",
      cashRemovedAtClosing: input.cashRemovedAtClosing,
      closingFloat,
      denominationBreakdown: input.denominationBreakdown,
      differenceReason: input.differenceReason || "",
      closingNote: input.closingNote || "",
      denominationCount: input.denominationBreakdown ? denominationTotal(input.denominationBreakdown) : input.denominationCount,
      status: "CLOSED",
      closedBy: { userId: user._id, name: user.name },
      closedAt: new Date(),
    });
    await current.save({ session });
    return current.toObject();
  });
  return ok(
    result,
    input.action === "open" ? "Business day opened" : input.action === "movement" ? "Cash movement recorded" : "Business day closed",
  );
}
