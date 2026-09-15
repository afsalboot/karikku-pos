import { Schema, model, options, ref, money } from "./shared.js";
const option = new Schema({
  name: { type: String, required: true },
  price: money,
});
const schema = new Schema(
  {
    name: { type: String, required: true, index: true },
    categoryId: ref("Category"),
    basePrice: money,
    imageUrl: { type: String, default: "" },
    active: { type: Boolean, default: true },
    available: { type: Boolean, default: true },
    special: { type: Boolean, default: false },
    variantsEnabled: Boolean,
    addonsEnabled: Boolean,
    variants: [option],
    addons: [option],
  },
  options,
);
schema.index({ active: 1, categoryId: 1, name: 1 });
const Product = model("Product", schema);
// Hot reload can retain the model compiled before availability was introduced.
// Update that cached model in place so existing imports also use the new field.
if (!Product.schema.path("available")) {
  Product.schema.add({ available: schema.obj.available });
  Product.recompileSchema();
}
if (!Product.schema.path("special")) {
  Product.schema.add({ special: schema.obj.special });
  Product.recompileSchema();
}
export default Product;
