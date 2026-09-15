import { cents, money } from "./calculations.js";
export function duplicateItems(sale, products) {
  return sale.items.map((item) => {
    const product = products.find(
      (p) => String(p._id) === String(item.productId),
    );
    if (
      !product?.active ||
      product.available === false ||
      !product.categoryId?.active
    )
      throw new Error(
        `${item.productName} is no longer available. Add available products manually.`,
      );
    const variants = product.variants.filter(
      (v) => v.name === item.variant?.name,
    );
    if (product.variantsEnabled && variants.length !== 1)
      throw new Error(`Choose a current variant for ${product.name} manually.`);
    if (!product.variantsEnabled && item.variant)
      throw new Error(
        `The options for ${product.name} have changed. Add it manually.`,
      );
    const variant = product.variantsEnabled ? variants[0] : null;
    const addons = item.addons.map((a) => {
      const matches = product.addons.filter((option) => option.name === a.name);
      if (!product.addonsEnabled || matches.length !== 1)
        throw new Error(
          `${a.name} is no longer available for ${product.name}. Add it manually.`,
        );
      return matches[0];
    });
    return {
      productId: product._id,
      name: product.name,
      imageUrl: product.imageUrl || "",
      categoryName: product.categoryId.name,
      variantId: variant?._id || null,
      variantName: variant?.name || "",
      addonIds: addons.map((a) => a._id),
      addonNames: addons.map((a) => a.name),
      unitTotal: money(
        cents(variant?.price ?? product.basePrice) +
          addons.reduce((sum, a) => sum + cents(a.price), 0),
      ),
      quantity: item.quantity,
      note: item.note || "",
    };
  });
}
