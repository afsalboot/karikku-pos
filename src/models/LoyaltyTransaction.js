import { Schema, model, options, ref } from "./shared.js";
const schema = new Schema({
  customerId: ref("Customer"), saleId: ref("Sale", false),
  transactionType: { type: String, enum: ["EARN", "REDEEM", "BONUS", "EXPIRED", "REFUND", "ADJUSTMENT", "STAMP_EARNED", "STAMP_REWARD", "VISIT_REWARD", "BIRTHDAY_REWARD"], required: true },
  programType: { type: String, enum: ["WALLET", "STAMP", "VISIT_STREAK", "BIRTHDAY", "REFERRAL", "TIER", "PROMOTION", "MANUAL"], required: true },
  points: { type: Number, default: 0 }, amount: { type: Number, default: 0 },
  balanceBefore: { type: Number, default: 0 }, balanceAfter: { type: Number, default: 0 },
  description: { type: String, required: true, maxlength: 300 }, expiryDate: Date,
  status: { type: String, enum: ["AVAILABLE", "REDEEMED", "EXPIRED", "PENDING", "REVERSED"], default: "AVAILABLE" },
  createdBy: ref("User", false),
}, options);
schema.index({ customerId: 1, createdAt: -1 });
schema.index({ saleId: 1, transactionType: 1 });
export default model("LoyaltyTransaction", schema);
