import { Schema, model, options } from "./shared.js";
import { checkoutDefaults, receiptDefaults, discountDefaults } from "../lib/settings-config.js";
export const defaults = {
  businessName: "Juice POS",
  checkout: checkoutDefaults,
  receipt: receiptDefaults,
  discounts: discountDefaults,
  upiId: "",
  address: "",
  phone: "",
  email: "",
  gstin: "",
  logo: "",
  currency: "INR",
  invoicePrefix: "JS-",
  invoiceNumberFormat: "SEQUENCE",
  invoiceSequencePadding: 6,
  startingNumber: 1,
  receiptFooter: "Thank you. Visit again!",
  paymentMethods: ["Cash", "UPI", "Card"],
  discountEnabled: true,
  allowCashierDiscount: false,
  maxCashierDiscount: 10,
  allowCashierExpenses: false,
  allowCashierDayClosing: false,
  receiptSize: "80mm",
  gstEnabled: false,
  taxRate: 0,
  loyalty: {
    enabled: true, allowRewardStacking: false,
    wallet: { enabled: true, cashbackPercentage: 3, minimumBillAmount: 100, maximumCashbackPerSale: 100, minimumRedemption: 20, maximumRedemptionPercent: 20, allowWithOtherRewards: true, expiryMonths: 6 },
    stamp: { enabled: true, requiredPurchases: 5, maximumFreeProductValue: 120, eligibleCategories: [], eligibleProducts: [], expiryDays: 90 },
    visit: { enabled: true, requiredVisits: 3, periodDays: 10, rewardType: "WALLET", rewardAmount: 30, minimumBillAmount: 100, oneRewardPerPeriod: true, countEverySale: false },
    birthday: { enabled: true, rewardType: "FIXED_DISCOUNT", rewardValue: 100, maximumFreeProductValue: 150, availability: "MONTH" },
  },
};
const schema = new Schema(
  {
    _id: { type: String, default: "shop" },
    businessName: String,
    checkout: Schema.Types.Mixed,
    receipt: Schema.Types.Mixed,
    discounts: Schema.Types.Mixed,
    upiId: String,
    address: String,
    phone: String,
    email: String,
    gstin: String,
    logo: String,
    currency: String,
    invoicePrefix: String,
    invoiceNumberFormat: String,
    invoiceSequencePadding: Number,
    startingNumber: Number,
    receiptFooter: String,
    paymentMethods: [String],
    discountEnabled: Boolean,
    allowCashierDiscount: Boolean,
    maxCashierDiscount: Number,
    allowCashierExpenses: Boolean,
    allowCashierDayClosing: Boolean,
    receiptSize: String,
    gstEnabled: Boolean,
    taxRate: Number,
    loyalty: Schema.Types.Mixed,
    invoiceSequence: { type: Number, default: 0 },
    revision: { type: Number, default: 0 },
  },
  options,
);
const Setting = model("Setting", schema);
for (const [key, type] of Object.entries({checkout: Schema.Types.Mixed, receipt: Schema.Types.Mixed, discounts: Schema.Types.Mixed, upiId: String})) {
  if (!Setting.schema.path(key)) Setting.schema.add({[key]: type});
}

// Turbopack keeps Mongoose models alive across hot reloads. Add newly introduced
// settings to an existing model so strict mode does not reject default values.
if (!Setting.schema.path("discountEnabled"))
  Setting.schema.add({ discountEnabled: Boolean });
if (!Setting.schema.path("invoiceNumberFormat"))
  Setting.schema.add({ invoiceNumberFormat: String });
if (!Setting.schema.path("invoiceSequencePadding"))
  Setting.schema.add({ invoiceSequencePadding: Number });

export default Setting;
