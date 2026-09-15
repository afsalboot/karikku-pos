import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import { admin, requireUser, fail } from "../lib/auth.js";
import { id } from "../lib/validation.js";
import { normalizePhone } from "../lib/customer.js";
import { ok, pagination, escapeRegex } from "../lib/http.js";
import { businessDate, dateBounds } from "../lib/dates.js";

export async function customers(request, recordId) {
  const user = await requireUser();
  const url = new URL(request.url);
  if (
    request.method === "GET" &&
    !recordId &&
    url.searchParams.get("lookup") === "true"
  ) {
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    if (q.length < 2) return ok({ items: [] });
    const phone = normalizePhone(q);
    const filters = [{ name: { $regex: escapeRegex(q), $options: "i" } }];
    if (phone && /^\d+$/.test(phone))
      filters.push({ phone: { $regex: escapeRegex(phone) } });
    return ok({
      items: await Customer.find({ $or: filters })
        .select("name phone loyalty")
        .sort({ name: 1, _id: 1 })
        .limit(6)
        .lean(),
    });
  }
  admin(user);
  const { page, limit, skip } = pagination(url);
  if (recordId) {
    id.parse(recordId);
    const customer = await Customer.findById(recordId).lean();
    if (!customer) fail(404, "Customer not found");
    const query = { "customer.customerId": customer._id };
    const [items, total, summary] = await Promise.all([
      Sale.find(query)
        .select(
          "invoiceNumber createdAt total paymentMethod status customer items.quantity",
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(query),
      Sale.aggregate([
        { $match: { ...query, status: "COMPLETED" } },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: "$total" },
            orders: { $sum: 1 },
            lastPurchase: { $max: "$createdAt" },
          },
        },
      ]),
    ]);
    return ok({
      customer,
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      summary: {
        orders: summary[0]?.orders || 0,
        totalSpent: summary[0]?.totalSpent || 0,
        averageOrder: summary[0]?.orders
          ? summary[0].totalSpent / summary[0].orders
          : 0,
        lastPurchase: summary[0]?.lastPurchase || null,
      },
    });
  }
  const q = url.searchParams.get("q")?.trim();
  const query = q
    ? {
        $or: [
          { name: { $regex: escapeRegex(q), $options: "i" } },
          { phone: { $regex: escapeRegex(normalizePhone(q)) } },
        ],
      }
    : {};
  const today = businessDate();
  const month = dateBounds(`${today.slice(0, 7)}-01`, today);
  const type = url.searchParams.get("type");
  const recent = url.searchParams.get("lastPurchase");
  if (type === "returning") query.orders = { $gt: 1 };
  if (type === "new") query.orders = { $lte: 1 };
  if (recent === "none") query.lastPurchase = null;
  else if (["today", "7", "30", "month"].includes(recent)) {
    const from =
      recent === "month"
        ? `${today.slice(0, 7)}-01`
        : new Date(
            Date.parse(`${today}T00:00:00Z`) -
              (recent === "today" ? 0 : Number(recent) - 1) * 86400000,
          )
            .toISOString()
            .slice(0, 10);
    query.lastPurchase = dateBounds(from, today);
  }
  const sorts = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    orders: { orders: -1, _id: 1 },
    spend: { totalSpent: -1, _id: 1 },
    recent: { lastPurchase: -1, _id: 1 },
    name: { name: 1, _id: 1 },
  };
  const sortKey = url.searchParams.get("sort");
  const sortOrder = Object.hasOwn(sorts, sortKey)
    ? sorts[sortKey]
    : sorts.newest;
  const [data] = await Customer.aggregate([
    {
      $lookup: {
        from: Sale.collection.name,
        localField: "_id",
        foreignField: "customer.customerId",
        pipeline: [
          { $match: { status: "COMPLETED" } },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              totalSpent: { $sum: "$total" },
              lastPurchase: { $max: "$createdAt" },
              monthSales: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$createdAt", month.$gte] },
                        { $lt: ["$createdAt", month.$lt] },
                      ],
                    },
                    "$total",
                    0,
                  ],
                },
              },
            },
          },
        ],
        as: "activity",
      },
    },
    { $set: { activity: { $arrayElemAt: ["$activity", 0] } } },
    {
      $set: {
        orders: { $ifNull: ["$activity.orders", 0] },
        totalSpent: { $round: [{ $ifNull: ["$activity.totalSpent", 0] }, 2] },
        lastPurchase: { $ifNull: ["$activity.lastPurchase", null] },
        monthSales: { $ifNull: ["$activity.monthSales", 0] },
      },
    },
    {
      $set: {
        averageOrder: {
          $cond: [
            { $gt: ["$orders", 0] },
            { $divide: ["$totalSpent", "$orders"] },
            0,
          ],
        },
      },
    },
    { $unset: "activity" },
    {
      $facet: {
        items: [
          { $match: query },
          { $sort: sortOrder },
          { $skip: skip },
          { $limit: limit },
        ],
        count: [{ $match: query }, { $count: "total" }],
        summary: [
          {
            $group: {
              _id: null,
              totalCustomers: { $sum: 1 },
              returningCustomers: {
                $sum: { $cond: [{ $gt: ["$orders", 1] }, 1, 0] },
              },
              newCustomers: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gte: ["$createdAt", month.$gte] },
                        { $lt: ["$createdAt", month.$lt] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
              customerSales: { $sum: "$monthSales" },
            },
          },
        ],
      },
    },
  ]).collation({ locale: "en", strength: 2 });
  const total = data.count[0]?.total || 0;
  return ok({
    items: data.items,
    total,
    page,
    pages: Math.ceil(total / limit),
    summary: {
      totalCustomers: 0,
      returningCustomers: 0,
      newCustomers: 0,
      customerSales: 0,
      ...data.summary[0],
    },
    summaryPeriod: { from: today.slice(0, 7) + "-01", to: today },
  });
}
