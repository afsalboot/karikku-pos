import Product from "../models/Product.js";
import Category from "../models/Category.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import { admin, fail, requireUser } from "../lib/auth.js";
import { body, ok, pagination, escapeRegex } from "../lib/http.js";
import { id, categorySchema, productSchema, productBulkSchema } from "../lib/validation.js";
import { getSettings, transaction } from "./settings.js";

export async function categories(request, recordId, expense = false) {
  const user = await requireUser();
  const Model = expense ? ExpenseCategory : Category;
  if (recordId) id.parse(recordId);
  if (
    expense &&
    user.role !== "ADMIN" &&
    !(await getSettings()).allowCashierExpenses
  )
    fail(403, "Expense access is disabled");
  if (request.method === "GET") {
    if (recordId) {
      const category = await Model.findById(recordId).lean();
      if (!category || (user.role !== "ADMIN" && !category.active))
        fail(404, "Category not found");
      return ok(category);
    }
    return ok(
      await Model.find(user.role === "ADMIN" ? {} : { active: true })
        .sort({ name: 1 })
        .limit(500)
        .lean(),
    );
  }
  if (!expense || request.method !== "POST") admin(user);
  const input = categorySchema.parse(await body(request));
  const value = { ...input, normalizedName: input.name.toLowerCase() };
  const result = await transaction(async (session) => {
    if (recordId) {
      const result = await Model.findByIdAndUpdate(recordId, value, {
        session,
        returnDocument: "after",
        runValidators: true,
      }).lean();
      if (!result) fail(404, "Category not found");
      return result;
    }
    if ((await Model.countDocuments({}).session(session)) >= 500)
      fail(400, "Category limit reached (500)");
    return (await Model.create([value], { session }))[0].toObject();
  });
  return ok(
    result,
    recordId ? "Category updated" : "Category created",
    recordId ? 200 : 201,
  );
}
export async function products(request, recordId) {
  const user = await requireUser();
  if (recordId === "bulk") {
    admin(user);
    if (request.method !== "PATCH") fail(405, "Method not allowed");
    const input = productBulkSchema.parse(await body(request));
    const result = await transaction(async session => {
      const query = { _id: { $in: input.ids } };
      if (await Product.countDocuments(query).session(session) !== input.ids.length)
        fail(409, "Some selected products no longer exist. Refresh and select again.");
      if (input.action === "delete") {
        const result = await Product.deleteMany(query, { session });
        return { count: result.deletedCount };
      }
      if (input.changes.categoryId && !await Category.exists({ _id: input.changes.categoryId, active: true }).session(session))
        fail(400, "Choose an active category");
      await Product.updateMany(query, { $set: input.changes }, { session, runValidators: true });
      return { count: input.ids.length };
    });
    return ok(result, `Products ${input.action === "delete" ? "deleted" : "updated"}`);
  }
  if (recordId) id.parse(recordId);
  if (request.method === "GET") {
    if (recordId) {
      const product = await Product.findById(recordId)
        .populate("categoryId", "name active")
        .lean();
      if (!product || (user.role !== "ADMIN" && !product.active))
        fail(404, "Product not found");
      return ok(product);
    }
    const url = new URL(request.url);
    const { page, limit, skip } = pagination(url);
    const query = {};
    if (url.searchParams.get("q")) {
      const match = {
        $regex: escapeRegex(url.searchParams.get("q")),
        $options: "i",
      };
      const matchingCategories = await Category.find({ name: match })
        .select("_id")
        .lean();
      query.$or = [
        { name: match },
        { "variants.name": match },
        { categoryId: { $in: matchingCategories.map((c) => c._id) } },
      ];
    }
    if (user.role !== "ADMIN" || url.searchParams.get("active") === "true")
      query.active = true;
    else if (url.searchParams.get("active") === "false") query.active = false;
    if (url.searchParams.get("special") === "true") query.special = true;
    if (url.searchParams.get("category"))
      query.categoryId = id.parse(url.searchParams.get("category"));
    if (url.searchParams.get("available") === "true")
      query.available = { $ne: false };
    else if (url.searchParams.get("available") === "false")
      query.available = false;
    const includeSummary =
      user.role === "ADMIN" && url.searchParams.get("summary") === "true";
    const [items, total, counts, categoryCount] = await Promise.all([
      Product.find(query)
        .populate("categoryId", "name active")
        .sort({ name: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
      includeSummary
        ? Product.aggregate([
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: ["$active", 1, 0] } },
              },
            },
          ])
        : null,
      includeSummary ? Category.countDocuments({}) : null,
    ]);
    const count = counts?.[0] || { total: 0, active: 0 };
    return ok({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      ...(includeSummary
        ? {
            summary: {
              total: count.total,
              active: count.active,
              inactive: count.total - count.active,
              categories: categoryCount,
            },
          }
        : {}),
    });
  }
  admin(user);
  const raw = await body(request);
  if (
    recordId &&
    Object.keys(raw).length === 1 &&
    (typeof raw.active === "boolean" || typeof raw.available === "boolean")
  ) {
    const result = await transaction((session) =>
      Product.findByIdAndUpdate(
        recordId,
        typeof raw.active === "boolean"
          ? { active: raw.active }
          : { available: raw.available },
        { session, returnDocument: "after" },
      ).lean(),
    );
    if (!result) fail(404, "Product not found");
    return ok(
      result,
      typeof raw.available === "boolean"
        ? "Product availability updated"
        : "Product status updated",
    );
  }
  const input = productSchema.parse(raw);
  const result = await transaction(async (session) => {
    if (
      !(await Category.exists({ _id: input.categoryId, active: true }).session(
        session,
      ))
    )
      fail(400, "Choose an active category");
    const value = {
      ...input,
      variants: input.variantsEnabled ? input.variants : [],
      addons: input.addonsEnabled ? input.addons : [],
    };
    if (recordId) {
      const p = await Product.findByIdAndUpdate(recordId, value, {
        session,
        returnDocument: "after",
        runValidators: true,
      }).lean();
      if (!p) fail(404, "Product not found");
      return p;
    }
    return (await Product.create([value], { session }))[0].toObject();
  });
  return ok(
    result,
    recordId ? "Product updated" : "Product created",
    recordId ? 200 : 201,
  );
}
