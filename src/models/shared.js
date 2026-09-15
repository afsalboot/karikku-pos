import mongoose from "mongoose";
export const { Schema } = mongoose;
export const options = { timestamps: true, strict: "throw" };
export const ref = (name, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: name,
  required,
});
export const money = { type: Number, required: true, min: 0 };
export const model = (name, schema) =>
  mongoose.models[name] || mongoose.model(name, schema);
