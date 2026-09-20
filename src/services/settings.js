import mongoose from "mongoose";
import { settingsWithDefaults } from "../lib/settings-config.js";
import { connectDB } from "../lib/mongodb.js";
import Setting, { defaults } from "../models/Setting.js";
import DaySession from "../models/DaySession.js";
import CashMovement from "../models/CashMovement.js";
import Sale from "../models/Sale.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Expense from "../models/Expense.js";
import ExpenseCategory from "../models/ExpenseCategory.js";
import Customer from "../models/Customer.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
let initialized;
export async function initialize() {
  await connectDB();
  if (!initialized)
    initialized = Promise.all(
      [
        Setting,
        DaySession,
        CashMovement,
        Sale,
        User,
        Product,
        Category,
        Expense,
        ExpenseCategory,
        Customer,
        LoyaltyTransaction,
      ].map((model) => model.init()),
    ).catch((error) => {
      initialized = null;
      throw error;
    });
  await initialized;
}
export async function getSettings() {
  await initialize();
  try {
    return await Setting.findOneAndUpdate(
      { _id: "shop" },
      { $setOnInsert: defaults },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    ).lean();
  } catch (error) {
    if (error.code === 11000) return Setting.findById("shop").lean();
    throw error;
  }
}
// A common write serializes checkout, session close, administrative changes and refunds.
export async function transaction(work) {
  const { requireUser, fail } = await import("../lib/auth.js");
  const actor = await requireUser();
  await getSettings();
  return mongoose.connection.transaction(async (session) => {
    const settings = await Setting.findOneAndUpdate(
      { _id: "shop" },
      { $inc: { revision: 1 } },
      { session, returnDocument: "after" },
    ).lean();
    if (
      !(await User.exists({
        _id: actor._id,
        active: true,
        role: actor.role,
        tokenVersion: actor.tokenVersion,
      }).session(session))
    )
      fail(401, "Your permissions changed. Sign in again.");
    return work(session, settings);
  });
}
export function clientSettings(settings, user) {
  const {
    invoiceSequence: _sequence,
    revision: _revision,
    loyalty: _loyalty,
    ...value
  } = settingsWithDefaults(settings);
  value.paymentMethods = value.paymentMethods.filter((method) =>
    ["Cash", "UPI", "Card"].includes(method),
  );
  value.discountEnabled = value.discountEnabled !== false;
  value.invoiceNumberFormat = value.invoiceNumberFormat || "SEQUENCE";
  value.invoiceSequencePadding = value.invoiceSequencePadding || 6;
  // Checkout only needs to know whether the program is available. Keep reward
  // rules server-side, where redemption and accrual are validated.
  value.loyaltyEnabled = Boolean(settings.loyalty?.enabled);
  if (user.role === "ADMIN") return { ...value, lastIssuedSequence: settings.invoiceSequence || 0 };
  const {
    businessName,
    currency,
    paymentMethods,
    discountEnabled,
    allowCashierDiscount,
    maxCashierDiscount,
    allowCashierExpenses,
    allowCashierDayClosing,
    gstEnabled,
    taxRate,
    loyaltyEnabled,
  } = value;
  return {
    checkout: value.checkout,
    receipt: value.receipt,
    discounts: value.discounts,
    upiId: value.upiId,
    businessName,
    currency,
    paymentMethods,
    discountEnabled,
    allowCashierDiscount,
    maxCashierDiscount,
    allowCashierExpenses,
    allowCashierDayClosing,
    gstEnabled,
    taxRate,
    loyaltyEnabled,
  };
}
