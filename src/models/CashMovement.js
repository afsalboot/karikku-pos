import { Schema, model, options, ref, money } from "./shared.js";
const schema = new Schema({
  daySessionId: ref("DaySession"),
  requestId: { type: String, required: true, unique: true },
  type: { type: String, enum: ["IN", "OUT"], required: true },
  category: { type: String, required: true },
  amount: money,
  note: String,
  createdBy: { userId: ref("User"), name: String },
}, options);
schema.index({ daySessionId: 1, createdAt: 1 });
export default model("CashMovement", schema);
