import { Schema, model, options, ref, money } from "./shared.js";
const extra = new Schema({ name: String, price: Number }, { _id: false });
const item = new Schema(
  {
    productId: ref("Product"),
    productName: String,
    categoryId: ref("Category"),
    categoryName: String,
    variant: extra,
    addons: [extra],
    note: String,
    quantity: Number,
    unitPrice: Number,
    addonTotal: Number,
    lineTotal: Number,
  },
  { _id: false },
);
const schema = new Schema(
  {
    invoiceNumber: { type: String, unique: true, required: true },
    requestId: { type: String, unique: true, required: true },
    requestFingerprint: String,
    daySessionId: ref("DaySession"),
    items: [item],
    subtotal: money,
    discount: { type: { type: String }, value: Number, amount: Number, reason: String },
    loyaltyDiscount: { type: Number, default: 0, min: 0 },
    tax: { enabled: Boolean, rate: Number, amount: Number },
    total: money,
    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Card", "Other", "Split"],
    },
    payments: {
      type: [
        new Schema(
          {
            method: {
              type: String,
              enum: ["Cash", "UPI", "Card"],
              required: true,
            },
            amount: money,
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    cashReceived: { type: Number, min: 0 },
    changeGiven: { type: Number, min: 0 },
    cashier: { userId: ref("User"), name: String },
    customer: {
      type: new Schema(
        { customerId: ref("Customer"), name: String, phone: String },
        { _id: false },
      ),
      default: undefined,
    },
    business: {
      name: String,
      address: String,
      phone: String,
      email: String,
      gstin: String,
      logo: String,
      footer: String,
      receiptSize: String,
      currency: String,
      receipt: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ["COMPLETED", "CANCELLED", "REFUNDED"],
      default: "COMPLETED",
    },
    statusReason: String,
    statusChangedBy: ref("User", false),
    statusChangedAt: Date,
    loyaltyProcessed: { type: Boolean, default: false },
    loyaltySummary: {
      walletRedeemed: { type: Number, default: 0 },
      cashbackEarned: { type: Number, default: 0 },
      stampEarned: { type: Number, default: 0 },
      rewardsRedeemed: { type: [String], default: [] },
      rewardsUnlocked: { type: [String], default: [] },
    },
  },
  options,
);
schema.add({ statusChangedSessionId: ref("DaySession", false) });
schema.index({ createdAt: -1 });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ paymentMethod: 1, createdAt: -1 });
schema.index({ daySessionId: 1, status: 1 });
schema.index({ statusChangedSessionId: 1 });
schema.index({ "customer.customerId": 1, status: 1, createdAt: -1 });
const Sale = model("Sale", schema);
if (!Sale.schema.path("business.receipt")) Sale.schema.add({"business.receipt": Schema.Types.Mixed});
if (!Sale.schema.path("discount.reason")) Sale.schema.add({"discount.reason": String});
if (!Sale.schema.path("payments")) {
  Sale.schema.add({
    payments: schema.obj.payments,
    cashReceived: schema.obj.cashReceived,
    changeGiven: schema.obj.changeGiven,
  });
  Sale.schema.path("paymentMethod").enum("Split");
  Sale.recompileSchema();
}
export default Sale;
