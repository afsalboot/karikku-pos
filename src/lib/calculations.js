export const cents = (value) => Math.round(value * 100);
export const money = (value) => Math.round(value) / 100;
export function calculateTotals(items, discount, settings, _user, loyaltyDiscount = 0) {
  const subtotalCents = items.reduce(
    (sum, item) => sum + cents(item.lineTotal),
    0,
  );
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 10000000000)
    throw new Error("Bill total is too large");
  if (
    !Number.isFinite(discount.value) ||
    discount.value < 0 ||
    !["fixed", "percentage"].includes(discount.type)
  )
    throw new Error("Invalid discount");
  if (discount.type === "percentage" && discount.value > 100)
    throw new Error("Discount cannot exceed 100%");
  const discountCents =
    discount.type === "percentage"
      ? Math.round((subtotalCents * discount.value) / 100)
      : cents(discount.value);
  if (discountCents > subtotalCents)
    throw new Error("Discount exceeds subtotal");
  if (discountCents > 0 && settings.discountEnabled === false)
    throw new Error("Discounts are disabled");
  if (discountCents > 0 && settings.discounts) {
    if (!settings.discounts.types.includes(discount.type)) throw new Error("This discount type is disabled");
    if (discount.type === "percentage" && discount.value > settings.discounts.maximumPercentage) throw new Error(`Discount cannot exceed ${settings.discounts.maximumPercentage}%`);
    if (discount.type === "fixed" && discount.value > settings.discounts.maximumFixed) throw new Error("Discount exceeds the configured fixed amount limit");
    if (settings.discounts.requireReason && !discount.reason?.trim()) throw new Error("Enter a discount reason");
  }
  const loyaltyCents = cents(loyaltyDiscount);
  if (loyaltyCents < 0 || loyaltyCents > subtotalCents - discountCents)
    throw new Error("Invalid loyalty redemption");
  const taxCents = settings.gstEnabled
    ? Math.round(((subtotalCents - discountCents - loyaltyCents) * settings.taxRate) / 100)
    : 0;
  return {
    subtotal: money(subtotalCents),
    discount: { ...discount, amount: money(discountCents) },
    tax: {
      enabled: settings.gstEnabled,
      rate: settings.gstEnabled ? settings.taxRate : 0,
      amount: money(taxCents),
    },
    loyaltyDiscount: money(loyaltyCents),
    total: money(subtotalCents - discountCents - loyaltyCents + taxCents),
  };
}
export function buildSaleItems(cart, products, categories) {
  return cart.map((row) => {
    const product = products.find((p) => String(p._id) === row.productId);
    if (!product || !product.active || product.available === false)
      throw new Error("A product is no longer available. Refresh the menu.");
    const category = categories.find(
      (c) => String(c._id) === String(product.categoryId),
    );
    if (!category?.active)
      throw new Error("Product category is no longer active");
    const variant = product.variantsEnabled
      ? product.variants.find((v) => String(v._id) === row.variantId)
      : null;
    if (product.variantsEnabled && !variant)
      throw new Error(`Select a valid variant for ${product.name}`);
    if (!product.variantsEnabled && row.variantId)
      throw new Error("This product does not have variants");
    if (new Set(row.addonIds).size !== row.addonIds.length)
      throw new Error("Duplicate add-ons are not allowed");
    if (!product.addonsEnabled && row.addonIds.length)
      throw new Error("This product does not have add-ons");
    const addons = row.addonIds.map((addonId) => {
      const addon = product.addons.find((a) => String(a._id) === addonId);
      if (!addon) throw new Error("Invalid add-on");
      return { name: addon.name, price: addon.price };
    });
    const unitPrice = variant ? variant.price : product.basePrice;
    const addonCents = addons.reduce((sum, a) => sum + cents(a.price), 0);
    return {
      productId: product._id,
      productName: product.name,
      categoryId: category._id,
      categoryName: category.name,
      variant: variant
        ? { name: variant.name, price: variant.price }
        : undefined,
      addons,
      note: row.note,
      quantity: row.quantity,
      unitPrice,
      addonTotal: money(addonCents),
      lineTotal: money((cents(unitPrice) + addonCents) * row.quantity),
    };
  });
}
