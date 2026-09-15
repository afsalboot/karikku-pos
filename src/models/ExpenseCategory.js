import { Schema, model, options } from "./shared.js";
export default model(
  "ExpenseCategory",
  new Schema(
    {
      name: { type: String, required: true },
      normalizedName: { type: String, unique: true, required: true },
      active: { type: Boolean, default: true },
    },
    options,
  ),
);
