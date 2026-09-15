import { Schema, model, options } from "./shared.js";
const schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, unique: true },
    dateOfBirth: Date,
    loyalty: {
      enabled: { type: Boolean, default: true },
      walletBalance: { type: Number, default: 0, min: 0 },
      lifetimeEarned: { type: Number, default: 0, min: 0 },
      lifetimeRedeemed: { type: Number, default: 0, min: 0 },
      stampCount: { type: Number, default: 0, min: 0 },
      availableStampRewards: { type: Number, default: 0, min: 0 },
      visitCount: { type: Number, default: 0, min: 0 },
      lastVisitDate: Date,
      visitPeriodStart: Date,
      lastVisitRewardAt: Date,
      birthdayRewardUsedYear: Number,
      tier: { type: String, default: "Bronze" },
    },
  },
  options,
);
const Customer = model("Customer", schema);
if (!Customer.schema.path("loyalty.visitPeriodStart")) Customer.schema.add({"loyalty.visitPeriodStart": Date, "loyalty.lastVisitRewardAt": Date});
export default Customer;
