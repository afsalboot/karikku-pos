import { Schema, model, options, ref, money } from "./shared.js";
const schema = new Schema(
  {
    categoryId: ref("ExpenseCategory"),
    categoryName: String,
    description: String,
    amount: money,
    paymentMethod: {
      type: String,
      enum: ["Cash", "UPI", "Card", "Bank Transfer", "Other"],
    },
    expenseDate: { type: Date, required: true, index: true },
    note: String,
    createdBy: { userId: ref("User"), name: String },
    daySessionId: ref("DaySession"),
    deletedAt: Date,
    deletedBy: ref("User", false),
  },
  options,
);
schema.index({ daySessionId: 1, deletedAt: 1 });
export default model("Expense", schema);
