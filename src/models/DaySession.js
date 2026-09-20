import { Schema, model, options, ref, money } from "./shared.js";
const schema = new Schema(
  {
    businessDate: { type: String, required: true },
    sessionNumber: Number,
    sessionCode: String,
    openingSource: { type: String, enum: ["PREVIOUS_FLOAT", "MANUAL", "ADJUSTED"] },
    openingAdjustmentReason: String,
    cashIn: { type: Number, default: 0 },
    cashOut: { type: Number, default: 0 },
    cashRemovedAtClosing: Number,
    closingFloat: Number,
    denominationBreakdown: { type: Map, of: Number },
    differenceDescription: String,
    reconciliationState: String,
    openingCash: money,
    openedBy: { userId: ref("User"), name: String },
    openedAt: Date,
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
    cashSales: Number,
    cashExpenses: Number,
    expectedCash: Number,
    actualCash: Number,
    difference: Number,
    differenceReason: String,
    closingNote: String,
    denominationCount: Number,
    closedBy: { userId: ref("User", false), name: String },
    closedAt: Date,
  },
  options,
);
schema.add({
  cashRefunds: Number,
  paymentBreakdown: {
    type: [{ _id: String, total: Number }],
    default: undefined,
  },
  totalSales: Number,
});
schema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } },
);
schema.index({ openedAt: -1 });
schema.index({ businessDate: 1, sessionNumber: 1 });
const DaySession = model("DaySession", schema);
if (!DaySession.schema.path("sessionNumber")) {
  DaySession.schema.add(Object.fromEntries(["sessionNumber", "sessionCode", "openingSource", "openingAdjustmentReason", "cashIn", "cashOut", "cashRemovedAtClosing", "closingFloat", "denominationBreakdown", "differenceDescription", "reconciliationState"].map(key => [key, schema.obj[key]])));
  DaySession.recompileSchema();
}
if (!DaySession.schema.path("paymentBreakdown")) {
  DaySession.schema.add({
    cashRefunds: Number,
    paymentBreakdown: {
      type: [{ _id: String, total: Number }],
      default: undefined,
    },
    totalSales: Number,
  });
  DaySession.recompileSchema();
}
export default DaySession;
