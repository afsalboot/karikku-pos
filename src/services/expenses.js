import Expense from "../models/Expense.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import DaySession from "../models/DaySession.js";
import { requireUser, admin, fail } from "../lib/auth.js";
import { body, ok, pagination, escapeRegex } from "../lib/http.js";
import { expenseSchema, id, payment } from "../lib/validation.js";
import { dateBounds } from "../lib/dates.js";
import { getSettings, transaction } from "./settings.js";

const expensePaymentMethods = ["Cash", "UPI", "Card", "Bank Transfer"];

export async function expenses(request, recordId) {
  const user = await requireUser();
  if (recordId) id.parse(recordId);
  if (user.role !== "ADMIN" && !(await getSettings()).allowCashierExpenses)
    fail(403, "Expense access is disabled");
  if (request.method === "GET") {
    const url = new URL(request.url);
    const { page, limit, skip } = pagination(url);
    const query = {
      deletedAt: null,
      expenseDate: dateBounds(
        url.searchParams.get("from"),
        url.searchParams.get("to"),
      ),
    };
    if (url.searchParams.get("q")) {
      const match = {
        $regex: escapeRegex(url.searchParams.get("q")),
        $options: "i",
      };
      query.$or = [{ description: match }, { categoryName: match }];
    }
    if (url.searchParams.get("category"))
      query.categoryId = id.parse(url.searchParams.get("category"));
    if (url.searchParams.get("payment"))
      query.paymentMethod = payment.parse(url.searchParams.get("payment"));
    if (url.searchParams.get("createdBy"))
      query["createdBy.userId"] = id.parse(url.searchParams.get("createdBy"));
    if (user.role !== "ADMIN") query["createdBy.userId"] = user._id;
    const creatorQuery = { ...query };
    delete creatorQuery["createdBy.userId"];
    const [items, total, totals, categories, creators] = await Promise.all([
      Expense.find(query)
        .sort({ expenseDate: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Expense.countDocuments(query),
      Expense.aggregate([
        { $match: query },
        { $group: { _id: null, amount: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$categoryName",
            amount: { $sum: "$amount" },
            transactions: { $sum: 1 },
          },
        },
        { $sort: { amount: -1, _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: creatorQuery },
        {
          $group: {
            _id: "$createdBy.userId",
            name: { $first: "$createdBy.name" },
          },
        },
        { $sort: { name: 1 } },
      ]),
    ]);
    return ok({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      amount: totals[0]?.amount || 0,
      summary: {
        amount: totals[0]?.amount || 0,
        transactions: total,
        average: total ? (totals[0]?.amount || 0) / total : 0,
        topCategory: categories[0] || null,
      },
      categories,
      creators,
    });
  }
  if (recordId) admin(user);
  const input =
    request.method === "DELETE"
      ? null
      : expenseSchema.parse(await body(request));
  const result = await transaction(async (session, settings) => {
    if (user.role !== "ADMIN" && !settings.allowCashierExpenses)
      fail(403, "Expense creation is disabled");
    const existing = recordId
      ? await Expense.findOne({ _id: recordId, deletedAt: null }).session(
          session,
        )
      : null;
    if (recordId && !existing) fail(404, "Expense not found");
    const day = existing
      ? await DaySession.findById(existing.daySessionId).session(session)
      : await DaySession.findOne({ status: "OPEN" }).session(session);
    if (day?.status !== "OPEN")
      fail(409, "Expenses can only be changed in an open business day");
    if (request.method === "DELETE") {
      existing.deletedAt = new Date();
      existing.deletedBy = user._id;
      await existing.save({ session });
      return null;
    }
    if (input.expenseDate !== day.businessDate)
      fail(400, "Expense date must match the open business day");
    if (!expensePaymentMethods.includes(input.paymentMethod))
      fail(400, "Choose a valid expense payment method");
    const category = await ExpenseCategory.findOne({
      _id: input.categoryId,
      active: true,
    })
      .session(session)
      .lean();
    if (!category) fail(400, "Choose an active expense category");
    const value = {
      ...input,
      categoryName: category.name,
      expenseDate: new Date(`${input.expenseDate}T12:00:00+05:30`),
      daySessionId: day._id,
    };
    if (existing) {
      Object.assign(existing, value);
      await existing.save({ session });
      return existing.toObject();
    }
    return (
      await Expense.create(
        [{ ...value, createdBy: { userId: user._id, name: user.name } }],
        { session },
      )
    )[0].toObject();
  });
  return ok(
    result,
    request.method === "DELETE" ? "Expense deleted" : "Expense saved",
    recordId ? 200 : 201,
  );
}
