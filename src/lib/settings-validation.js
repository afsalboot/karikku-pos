import { z } from "zod";
const amount = z.number().finite().min(0).max(1000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Use at most two decimal places");
const percent = z.number().finite().min(0).max(100);
export const checkoutSettingsSchema = z.object({ defaultQuantity: z.number().int().min(1).max(999), allowCustomQuantity: z.boolean(), allowItemNotes: z.boolean(), customerPrompt: z.enum(["NEVER", "OPTIONAL", "REQUIRED"]), cashAmountEntry: z.boolean(), splitPayment: z.boolean(), showSuccess: z.boolean(), autoPrint: z.boolean(), returnToNewSale: z.boolean() }).strict();
export const receiptSettingsSchema = z.object({ showLogo: z.boolean(), showCustomer: z.boolean(), showCashier: z.boolean(), showPayment: z.boolean(), showLoyalty: z.boolean(), copies: z.number().int().min(1).max(5) }).strict();
export const discountSettingsSchema = z.object({ types: z.array(z.enum(["percentage", "fixed"])).min(1, "Choose at least one discount type").max(2).refine(v=>new Set(v).size===v.length), maximumPercentage: percent, maximumFixed: amount, requireReason: z.boolean() }).strict();
export const loyaltySettingsSchema = z.object({
  enabled: z.boolean(), allowRewardStacking: z.boolean(),
  wallet: z.object({ enabled: z.boolean(), cashbackPercentage: percent, minimumBillAmount: amount, maximumCashbackPerSale: amount, minimumRedemption: amount, maximumRedemptionPercent: percent, allowWithOtherRewards: z.boolean(), expiryMonths: z.number().int().min(0).max(120) }).strict(),
  stamp: z.object({ enabled: z.boolean(), requiredPurchases: z.number().int().min(1).max(100), maximumFreeProductValue: amount, eligibleCategories: z.array(z.string().regex(/^[a-f0-9]{24}$/i)), eligibleProducts: z.array(z.string().regex(/^[a-f0-9]{24}$/i)), expiryDays: z.number().int().min(0).max(3650) }).strict(),
  visit: z.object({ enabled: z.boolean(), requiredVisits: z.number().int().min(1).max(100), periodDays: z.number().int().min(1).max(365), rewardType: z.literal("WALLET"), rewardAmount: amount, minimumBillAmount: amount, oneRewardPerPeriod: z.boolean(), countEverySale: z.boolean() }).strict(),
  birthday: z.object({ enabled: z.boolean(), rewardType: z.enum(["WALLET", "FIXED_DISCOUNT", "PERCENTAGE_DISCOUNT"]), rewardValue: amount, maximumFreeProductValue: amount, availability: z.enum(["DAY", "WEEK", "MONTH"]) }).strict().refine(v=>v.rewardType!=="PERCENTAGE_DISCOUNT"||v.rewardValue<=100,{message:"Percentage reward cannot exceed 100%",path:["rewardValue"]})
}).strict();
