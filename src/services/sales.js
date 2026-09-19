import { createHash } from "node:crypto";
import { Types } from "mongoose";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Setting from "../models/Setting.js";
import DaySession from "../models/DaySession.js";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import { requireUser, admin, fail } from "../lib/auth.js";
import { body, ok, pagination, escapeRegex } from "../lib/http.js";
import {
  checkoutSchema,
  id,
  statusSchema,
  payment,
} from "../lib/validation.js";
import { buildSaleItems, calculateTotals } from "../lib/calculations.js";
import { dateBounds } from "../lib/dates.js";
import { transaction } from "./settings.js";
import { formatInvoiceNumber } from "../lib/invoice-number.js";
import { normalizePayment, paymentGroups } from "../lib/payments.js";
import { processLoyaltySale, redemptionFor, reverseLoyaltyForSale } from "./loyalty.js";
import { salesHistoryPage } from "../lib/sales-history-query.js";

export async function sales(request, recordId) {
  const user = await requireUser();
  if (recordId) id.parse(recordId);
  if (request.method === "GET") {
    if (recordId) {
      const sale = await Sale.findById(recordId).lean();
      if (!sale) fail(404, "Sale not found");
      return ok(sale);
    }
    const url = new URL(request.url);
    const { page, limit, skip } = pagination(url);
    const query = {
      createdAt: dateBounds(
        url.searchParams.get("from"),
        url.searchParams.get("to"),
      ),
    };
    if (url.searchParams.get("q")) {
      const match = {
        $regex: escapeRegex(url.searchParams.get("q")),
        $options: "i",
      };
      query.$or = [
        { invoiceNumber: match },
        { "customer.name": match },
        { "items.productName": match },
      ];
    }
    if (url.searchParams.get("payment")) {
      const method = url.searchParams.get("payment");
      if (method === "Split") query.paymentMethod = "Split";
      else {
        payment.parse(method);
        query.$and = [
          { $or: [{ paymentMethod: method }, { "payments.method": method }] },
        ];
      }
    }
    if (url.searchParams.get("cashier"))
      query["cashier.userId"] = new Types.ObjectId(
        id.parse(url.searchParams.get("cashier")),
      );
    if (url.searchParams.get("product"))
      query["items.productName"] = {
        $regex: escapeRegex(url.searchParams.get("product")),
        $options: "i",
      };
    if (
      ["COMPLETED", "CANCELLED", "REFUNDED"].includes(
        url.searchParams.get("status"),
      )
    )
      query.status = url.searchParams.get("status");
    const includeSummary = url.searchParams.get("summary") === "true";
    const [items, total, cashiers, aggregates] = await Promise.all([
      salesHistoryPage(query, { skip, limit }),
      Sale.countDocuments(query),
      User.find({}).select("name").limit(500).lean(),
      includeSummary
        ? Sale.aggregate([
            { $match: query },
            { $project: { status: 1, total: 1, paymentMethod: 1, payments: 1 } },
            {
              $facet: {
                totals: [
                  { $match: { status: "COMPLETED" } },
                  {
                    $group: {
                      _id: null,
                      sales: { $sum: "$total" },
                      orders: { $sum: 1 },
                    },
                  },
                ],
                payments: [
                  { $match: { status: "COMPLETED" } },
                  ...paymentGroups,
                ],
              },
            },
          ])
        : Promise.resolve(null),
    ]);
    return ok({
      items,
      total,
      page,
      pages: Math.ceil(total / limit),
      cashiers,
      ...(includeSummary
        ? {
            summary: {
              sales: aggregates[0]?.totals[0]?.sales || 0,
              orders: aggregates[0]?.totals[0]?.orders || 0,
              averageBill: aggregates[0]?.totals[0]?.orders
                ? aggregates[0].totals[0].sales / aggregates[0].totals[0].orders
                : 0,
              payments: aggregates[0]?.payments || [],
            },
          }
        : {}),
    });
  }
  if (request.method === "PATCH") {
    admin(user);
    const input = statusSchema.parse(await body(request));
    const sale = await transaction(async (session) => {
      const sale = await Sale.findById(recordId).session(session);
      if (!sale) fail(404, "Sale not found");
      if (sale.status !== "COMPLETED")
        fail(409, "Only completed sales can be cancelled or refunded");
      const day = await DaySession.findOne({ status: "OPEN" }).session(session);
      if (!day)
        fail(409, "Open a business day to record this payment reversal");
      sale.status = input.status;
      sale.statusReason = input.reason;
      sale.statusChangedBy = user._id;
      sale.statusChangedAt = new Date();
      sale.statusChangedSessionId = day._id;
      await sale.save({ session });
      if (input.status === "REFUNDED") await reverseLoyaltyForSale({ sale, actor: user, session });
      return sale.toObject();
    });
    return ok(sale, "Sale status updated");
  }
  const input = checkoutSchema.parse(await body(request));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const result = await transaction(async (session, settings) => {
    const existing = await Sale.findOne({ requestId: input.requestId })
      .session(session)
      .lean();
    if (existing) {
      if (
        String(existing.cashier.userId) !== String(user._id) ||
        existing.requestFingerprint !== fingerprint
      )
        fail(409, "Checkout request was already used for a different sale");
      return existing;
    }
    const { validateCheckoutSettings } = await import("../lib/settings-config.js");
    try { validateCheckoutSettings(input, settings); } catch(error) { fail(400, error.message); }
    const liveUser = await User.findOne({
      _id: user._id,
      active: true,
      tokenVersion: user.tokenVersion,
    })
      .session(session)
      .lean();
    if (!liveUser) fail(401, "Your session changed. Sign in again.");
    const day = await DaySession.findOne({ status: "OPEN" })
      .session(session)
      .lean();
    if (!day) fail(409, "Open a business day before checkout");
    const products = await Product.find({
      _id: { $in: input.items.map((item) => item.productId) },
    })
      .session(session)
      .lean();
    const categories = await Category.find({
      _id: { $in: products.map((p) => p.categoryId) },
    })
      .session(session)
      .lean();
    let items, totals, paymentData, customerRecord, loyaltyRedemption;
    try {
      items = buildSaleItems(input.items, products, categories);
    } catch (error) {
      fail(400, error.message);
    }
    let customer;
    if (input.customer) {
      customerRecord = await Customer.findOneAndUpdate(
        { phone: input.customer.phone },
        {
          $set: { name: input.customer.name },
          $setOnInsert: { phone: input.customer.phone },
        },
        { session, upsert: true, returnDocument: "after", runValidators: true },
      );
      customer = {
        customerId: customerRecord._id,
        name: input.customer.name,
        phone: input.customer.phone,
      };
    }
    try {
      const base = calculateTotals(items, input.discount, settings, liveUser);
      loyaltyRedemption = customerRecord ? redemptionFor({ customer: customerRecord, settings, subtotalAfterDiscount: base.subtotal - base.discount.amount, requested: input.loyalty || {} }) : { wallet: 0, promotional: 0, used: [] };
      if (!customerRecord && input.loyalty && (input.loyalty.walletAmount || input.loyalty.stampReward || input.loyalty.birthdayReward)) fail(400, "Loyalty rewards require a registered customer");
      totals = calculateTotals(items, input.discount, settings, liveUser, loyaltyRedemption.wallet + loyaltyRedemption.promotional);
      paymentData = normalizePayment(input, totals.total, settings.paymentMethods);
    } catch (error) { fail(400, error.message); }
    const next = Math.max(
      settings.invoiceSequence + 1,
      settings.startingNumber,
    );
    await Setting.updateOne(
      { _id: "shop" },
      { $set: { invoiceSequence: next } },
      { session },
    );
    const sale = (
      await Sale.create(
        [
          {
            invoiceNumber: formatInvoiceNumber({
              prefix: settings.invoicePrefix,
              format: settings.invoiceNumberFormat,
              sequence: next,
              sequencePadding: settings.invoiceSequencePadding,
            }),
            requestId: input.requestId,
            requestFingerprint: fingerprint,
            daySessionId: day._id,
            items,
            ...totals,
            ...paymentData,
            cashier: { userId: liveUser._id, name: liveUser.name },
            ...(customer ? { customer } : {}),
            business: {
              name: settings.businessName,
              address: settings.address,
              phone: settings.phone,
              email: settings.email,
              gstin: settings.gstin,
              logo: settings.logo,
              footer: settings.receiptFooter,
              receiptSize: settings.receiptSize,
              currency: settings.currency,
              receipt: settings.receipt,
            },
          },
        ],
        { session },
      )
    )[0];
    if (customerRecord) await processLoyaltySale({ customerId: customerRecord._id, sale, settings, rewardsUsed: input.loyalty || {}, actor: liveUser, session });
    return sale.toObject();
  });
  return ok(result, "Sale completed successfully", 201);
}
