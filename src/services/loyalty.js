import { loyaltySettingsSchema } from "../lib/settings-validation.js";
import { birthdayEligible } from "../lib/reward-periods.js";
import Customer from "../models/Customer.js";
import LoyaltyTransaction from "../models/LoyaltyTransaction.js";
import Sale from "../models/Sale.js";
import { defaults } from "../models/Setting.js";
import { admin, fail, requireUser } from "../lib/auth.js";
import { body, ok, pagination } from "../lib/http.js";
import { id, loyaltyPreviewSchema, birthdayProofSchema } from "../lib/validation.js";
import { businessDate } from "../lib/dates.js";
import { transaction } from "./settings.js";

export const loyaltyConfig = (settings) => ({ ...defaults.loyalty, ...(settings.loyalty || {}), wallet: { ...defaults.loyalty.wallet, ...(settings.loyalty?.wallet || {}) }, stamp: { ...defaults.loyalty.stamp, ...(settings.loyalty?.stamp || {}) }, visit: { ...defaults.loyalty.visit, ...(settings.loyalty?.visit || {}) }, birthday: { ...defaults.loyalty.birthday, ...(settings.loyalty?.birthday || {}) } });
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sameDay = (a, b) => a && new Date(a).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) === new Date(b).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const birthdayAvailable = (customer, config) => {
  if (!config.enabled || !config.birthday.enabled || !customer.dateOfBirth) return false;
  return birthdayEligible(customer, config.birthday);
};
export function rewardsFor(customer, settings) {
  const config = loyaltyConfig(settings); const loyalty = customer.loyalty || {};
  if (!config.enabled || loyalty.enabled === false) return { enabled: false, wallet: 0, stamp: null, birthday: null };
  return { enabled: true, wallet: loyalty.walletBalance || 0, stamp: config.stamp.enabled && loyalty.availableStampRewards ? { available: loyalty.availableStampRewards, maximumValue: config.stamp.maximumFreeProductValue, required: config.stamp.requiredPurchases, progress: loyalty.stampCount || 0 } : null, birthday: birthdayAvailable(customer, config) ? config.birthday : null, tier: loyalty.tier || "Bronze" };
}
export function redemptionFor({ customer, settings, subtotalAfterDiscount, requested = {} }) {
  const config = loyaltyConfig(settings); const rewards = rewardsFor(customer, settings);
  if (!rewards.enabled) return { wallet: 0, promotional: 0, used: [] };
  if (requested.birthdayReward && requested.birthdayProof) {
    const proof = birthdayProofSchema.parse(requested.birthdayProof);
    if (customer.dateOfBirth && new Date(customer.dateOfBirth).toISOString().slice(0, 10) !== proof.dateOfBirth)
      fail(400, "The proof date does not match the customer's saved birthday");
    if (!config.birthday.enabled) fail(400, "Birthday rewards are disabled");
    if (customer.loyalty?.birthdayRewardUsedYear === Number(businessDate().slice(0, 4)))
      fail(400, "This customer has already used their birthday reward this year");
    if (!birthdayEligible({ ...customer, dateOfBirth: proof.dateOfBirth, loyalty: customer.loyalty }, config.birthday))
      fail(400, "The verified birthday is outside the configured birthday reward period");
    rewards.birthday = config.birthday;
  }
  const walletRequest = round(requested.walletAmount);
  let wallet = 0;
  if (walletRequest) {
    if (!config.wallet.enabled) fail(400, "Loyalty wallet is disabled");
    const cap = round(subtotalAfterDiscount * config.wallet.maximumRedemptionPercent / 100);
    if (walletRequest < config.wallet.minimumRedemption || walletRequest > cap || walletRequest > rewards.wallet) fail(400, "Wallet redemption is outside the allowed limit");
    wallet = walletRequest;
  }
  const choices = [requested.stampReward && "STAMP", requested.birthdayReward && "BIRTHDAY"].filter(Boolean);
  if (choices.length > 1 || (!config.allowRewardStacking && choices.length && wallet && !config.wallet.allowWithOtherRewards)) fail(400, "These rewards cannot be combined");
  let promotional = 0;
  if (requested.stampReward) { if (!rewards.stamp?.available) fail(400, "No stamp reward is available"); promotional = Math.min(config.stamp.maximumFreeProductValue, subtotalAfterDiscount - wallet); }
  if (requested.birthdayReward) { if (!rewards.birthday) fail(400, "Birthday reward is unavailable"); promotional = rewards.birthday.rewardType === "WALLET" ? 0 : rewards.birthday.rewardType === "PERCENTAGE_DISCOUNT" ? round(subtotalAfterDiscount * rewards.birthday.rewardValue / 100) : Math.min(rewards.birthday.rewardValue, subtotalAfterDiscount - wallet); }
  if (wallet + promotional > subtotalAfterDiscount) fail(400, "Rewards exceed the sale amount");
  return { wallet, promotional: round(promotional), used: choices };
}
async function record(session, fields) { await LoyaltyTransaction.create([{ ...fields }], { session }); }
export async function processLoyaltySale({ customerId, sale, settings, rewardsUsed, actor, session }) {
  if (!customerId || sale.loyaltyProcessed) return;
  const customer = await Customer.findById(customerId).session(session); if (!customer) return;
  const config = loyaltyConfig(settings); const loyalty = customer.loyalty || {}; if (!config.enabled || loyalty.enabled === false) { sale.loyaltyProcessed = true; await sale.save({ session }); return; }
  const summary = { walletRedeemed: 0, cashbackEarned: 0, stampEarned: 0, rewardsRedeemed: [], rewardsUnlocked: [] };
  const redemption = redemptionFor({ customer, settings, subtotalAfterDiscount: sale.subtotal - sale.discount.amount, requested: rewardsUsed });
  if (redemption.wallet) { const before = loyalty.walletBalance || 0; loyalty.walletBalance = round(before - redemption.wallet); loyalty.lifetimeRedeemed = round((loyalty.lifetimeRedeemed || 0) + redemption.wallet); summary.walletRedeemed = redemption.wallet; await record(session, { customerId, saleId: sale._id, transactionType: "REDEEM", programType: "WALLET", amount: -redemption.wallet, balanceBefore: before, balanceAfter: loyalty.walletBalance, description: `Wallet redeemed on ${sale.invoiceNumber}`, status: "REDEEMED", createdBy: actor._id }); }
  if (redemption.used.includes("STAMP")) { loyalty.availableStampRewards = Math.max(0, (loyalty.availableStampRewards || 0) - 1); loyalty.stampCount = 0; summary.rewardsRedeemed.push("STAMP"); await record(session, { customerId, saleId: sale._id, transactionType: "STAMP_REWARD", programType: "STAMP", description: `Free drink reward redeemed on ${sale.invoiceNumber}`, status: "REDEEMED", createdBy: actor._id }); }
  if (redemption.used.includes("BIRTHDAY")) { loyalty.birthdayRewardUsedYear = Number(businessDate().slice(0,4)); const birthdayCredit = config.birthday.rewardType === "WALLET" ? config.birthday.rewardValue : 0; if(birthdayCredit) {loyalty.walletBalance=round((loyalty.walletBalance||0)+birthdayCredit);loyalty.lifetimeEarned=round((loyalty.lifetimeEarned||0)+birthdayCredit);summary.rewardsUnlocked.push("BIRTHDAY_WALLET");} summary.rewardsRedeemed.push("BIRTHDAY"); await record(session, { customerId, saleId: sale._id, transactionType: "BIRTHDAY_REWARD", programType: "BIRTHDAY", amount: birthdayCredit || -redemption.promotional, description: `Birthday reward redeemed on ${sale.invoiceNumber}${rewardsUsed?.birthdayProof ? `; birthday proof checked (${rewardsUsed.birthdayProof.dateOfBirth})` : ""}`, status: "REDEEMED", createdBy: actor._id }); }
  const eligibleAmount = Math.max(0, sale.subtotal - sale.discount.amount - redemption.wallet - redemption.promotional);
  if (config.wallet.enabled && eligibleAmount >= config.wallet.minimumBillAmount) { const earned = Math.min(config.wallet.maximumCashbackPerSale, round(eligibleAmount * config.wallet.cashbackPercentage / 100)); if (earned) { const before = loyalty.walletBalance || 0; loyalty.walletBalance = round(before + earned); loyalty.lifetimeEarned = round((loyalty.lifetimeEarned || 0) + earned); summary.cashbackEarned = earned; const expiryDate = config.wallet.expiryMonths ? new Date(new Date().setMonth(new Date().getMonth() + config.wallet.expiryMonths)) : undefined; await record(session, { customerId, saleId: sale._id, transactionType: "EARN", programType: "WALLET", amount: earned, balanceBefore: before, balanceAfter: loyalty.walletBalance, description: `Cashback earned on ${sale.invoiceNumber}`, expiryDate, createdBy: actor._id }); } }
  const eligibleStamp = config.stamp.enabled && sale.items.some((item) => !config.stamp.eligibleCategories.length && !config.stamp.eligibleProducts.length || config.stamp.eligibleCategories.map(String).includes(String(item.categoryId)) || config.stamp.eligibleProducts.map(String).includes(String(item.productId)));
  if (eligibleStamp && !loyalty.availableStampRewards) { loyalty.stampCount = (loyalty.stampCount || 0) + 1; summary.stampEarned = 1; if (loyalty.stampCount >= config.stamp.requiredPurchases) { loyalty.stampCount = config.stamp.requiredPurchases; loyalty.availableStampRewards = (loyalty.availableStampRewards || 0) + 1; summary.rewardsUnlocked.push("STAMP"); } await record(session, { customerId, saleId: sale._id, transactionType: "STAMP_EARNED", programType: "STAMP", points: 1, description: `Stamp earned on ${sale.invoiceNumber}`, createdBy: actor._id }); }
  if (config.visit.enabled && sale.total >= config.visit.minimumBillAmount && (config.visit.countEverySale || !sameDay(loyalty.lastVisitDate, sale.createdAt))) { const periodMs=config.visit.periodDays*86400000; if(!loyalty.visitPeriodStart || new Date(sale.createdAt)-new Date(loyalty.visitPeriodStart)>=periodMs){loyalty.visitCount=0;loyalty.visitPeriodStart=sale.createdAt;} loyalty.visitCount = (loyalty.visitCount || 0) + 1; loyalty.lastVisitDate = sale.createdAt; if (loyalty.visitCount >= config.visit.requiredVisits && (!config.visit.oneRewardPerPeriod || !loyalty.lastVisitRewardAt || new Date(sale.createdAt)-new Date(loyalty.lastVisitRewardAt)>=periodMs)) { loyalty.lastVisitRewardAt=sale.createdAt; const before = loyalty.walletBalance || 0; loyalty.walletBalance = round(before + config.visit.rewardAmount); loyalty.lifetimeEarned = round((loyalty.lifetimeEarned || 0) + config.visit.rewardAmount); loyalty.visitCount = 0; summary.rewardsUnlocked.push("VISIT_STREAK"); await record(session, { customerId, saleId: sale._id, transactionType: "VISIT_REWARD", programType: "VISIT_STREAK", amount: config.visit.rewardAmount, balanceBefore: before, balanceAfter: loyalty.walletBalance, description: `Visit streak reward on ${sale.invoiceNumber}`, createdBy: actor._id }); } }
  customer.loyalty = loyalty; sale.loyaltySummary = summary; sale.loyaltyProcessed = true; await customer.save({ session }); await sale.save({ session });
}
export async function reverseLoyaltyForSale({ sale, actor, session }) {
  if (!sale.customer?.customerId || !sale.loyaltyProcessed || !sale.loyaltySummary?.cashbackEarned) return;
  const customer = await Customer.findById(sale.customer.customerId).session(session); if (!customer) return;
  const before = customer.loyalty?.walletBalance || 0; const amount = Math.min(before, sale.loyaltySummary.cashbackEarned);
  customer.loyalty = { ...(customer.loyalty?.toObject?.() || customer.loyalty || {}), walletBalance: round(before - amount), lifetimeEarned: Math.max(0, round((customer.loyalty?.lifetimeEarned || 0) - amount)) };
  await customer.save({ session });
  await record(session, { customerId: customer._id, saleId: sale._id, transactionType: "REFUND", programType: "WALLET", amount: -amount, balanceBefore: before, balanceAfter: customer.loyalty.walletBalance, description: `Cashback reversed for ${sale.invoiceNumber}`, status: amount < sale.loyaltySummary.cashbackEarned ? "PENDING" : "REVERSED", createdBy: actor._id });
}
export async function loyalty(request, action) {
  const user = await requireUser(); const url = new URL(request.url);
  if (action === "settings") { if (request.method === "GET") { const { getSettings } = await import("./settings.js"); return ok(loyaltyConfig(await getSettings())); } admin(user); const input = await body(request); const saved = await transaction(async (session, current) => { const Setting = (await import("../models/Setting.js")).default; return Setting.findByIdAndUpdate("shop", { $set: { loyalty: loyaltySettingsSchema.parse({ ...loyaltyConfig(current), ...input }) } }, { session, returnDocument: "after" }).lean(); }); return ok(loyaltyConfig(saved), "Loyalty settings saved"); }
  const customerId = url.searchParams.get("customerId"); if (["customer", "history", "rewards", "adjust"].includes(action) && customerId) id.parse(customerId);
  if (action === "preview" && request.method === "POST") {
    const input = loyaltyPreviewSchema.parse(await body(request));
    const customer = await Customer.findById(input.customerId).lean();
    if (!customer) fail(404, "Customer not found");
    const { getSettings } = await import("./settings.js");
    return ok(redemptionFor({
      customer,
      settings: await getSettings(),
      subtotalAfterDiscount: input.subtotalAfterDiscount,
      requested: input.loyalty,
    }));
  }
  if (action === "customer" && request.method === "GET") { const customer = await Customer.findById(customerId).lean(); if (!customer) fail(404, "Customer not found"); const { getSettings } = await import("./settings.js"); return ok({ customer, rewards: rewardsFor(customer, await getSettings()) }); }
  if (action === "rewards" && request.method === "GET") { const customer = await Customer.findById(customerId).lean(); if (!customer) fail(404, "Customer not found"); const { getSettings } = await import("./settings.js"); return ok(rewardsFor(customer, await getSettings())); }
  if (action === "history" && request.method === "GET") { const { page, limit, skip } = pagination(url); const type = url.searchParams.get("type"); const query = { customerId, ...(type ? { transactionType: type } : {}) }; const [items, total] = await Promise.all([LoyaltyTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("saleId", "invoiceNumber").populate("createdBy", "name").lean(), LoyaltyTransaction.countDocuments(query)]); return ok({ items, total, page, pages: Math.ceil(total / limit) }); }
  if (action === "report" && request.method === "GET") {
    admin(user);
    const [summary, top, liability] = await Promise.all([
      LoyaltyTransaction.aggregate([{ $group: { _id: null, earned: { $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] } }, redeemed: { $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] } } } }]),
      Customer.find({ "loyalty.walletBalance": { $gt: 0 } }).select("name loyalty").sort({ "loyalty.walletBalance": -1 }).limit(10).lean(),
      Customer.aggregate([{ $group: { _id: null, amount: { $sum: { $ifNull: ["$loyalty.walletBalance", 0] } }, customers: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$loyalty.walletBalance", 0] }, 0] }, 1, 0] } } } }]),
    ]);
    return ok({ summary: { earned: summary[0]?.earned || 0, redeemed: summary[0]?.redeemed || 0, outstandingLiability: liability[0]?.amount || 0, activeCustomers: liability[0]?.customers || 0 }, topCustomers: top });
  }
  if (action === "adjust" && request.method === "POST") { admin(user); const input = await body(request); const amount = round(input.amount); if (!customerId || !Number.isFinite(amount) || amount <= 0 || !["ADD", "DEDUCT"].includes(input.direction) || !String(input.reason || "").trim()) fail(400, "A positive amount and reason are required"); const result = await transaction(async (session) => { const customer = await Customer.findById(customerId).session(session); if (!customer) fail(404, "Customer not found"); const before = customer.loyalty?.walletBalance || 0; const delta = input.direction === "ADD" ? amount : -amount; if (before + delta < 0) fail(400, "Adjustment would make the wallet negative"); customer.loyalty = { ...(customer.loyalty?.toObject?.() || customer.loyalty || {}), walletBalance: round(before + delta), lifetimeEarned: round((customer.loyalty?.lifetimeEarned || 0) + (delta > 0 ? delta : 0)), lifetimeRedeemed: round((customer.loyalty?.lifetimeRedeemed || 0) + (delta < 0 ? -delta : 0)) }; await customer.save({ session }); await record(session, { customerId, transactionType: "ADJUSTMENT", programType: "MANUAL", amount: delta, balanceBefore: before, balanceAfter: customer.loyalty.walletBalance, description: input.reason.trim(), createdBy: user._id }); return customer.loyalty; }); return ok(result, "Loyalty balance adjusted"); }
  fail(404, "Loyalty endpoint not found");
}
