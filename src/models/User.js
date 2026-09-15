import { Schema, model, options } from "./shared.js";
const schema = new Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["ADMIN", "CASHIER"], required: true },
    active: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    loginFailures: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
  },
  options,
);
export default model("User", schema);
