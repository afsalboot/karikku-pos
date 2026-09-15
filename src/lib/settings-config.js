export const checkoutDefaults = { defaultQuantity: 1, allowCustomQuantity: true, allowItemNotes: true, customerPrompt: "OPTIONAL", cashAmountEntry: true, splitPayment: true, showSuccess: true, autoPrint: false, returnToNewSale: true };
export const receiptDefaults = { showLogo: true, showCustomer: true, showCashier: true, showPayment: true, showLoyalty: true, copies: 1 };
export const discountDefaults = { types: ["percentage", "fixed"], maximumPercentage: 100, maximumFixed: 1000000, requireReason: false };
export function settingsWithDefaults(settings) {
  return { ...settings, upiId: settings.upiId || "", checkout: { ...checkoutDefaults, ...settings.checkout }, receipt: { ...receiptDefaults, ...settings.receipt }, discounts: { ...discountDefaults, ...settings.discounts } };
}
export function validateCheckoutSettings(input, settings) {
  const { checkout } = settingsWithDefaults(settings);
  if (checkout.customerPrompt === "REQUIRED" && !input.customer) throw new Error("Customer details are required at checkout");
  if (checkout.customerPrompt === "NEVER" && input.customer) throw new Error("Customer collection is disabled at checkout");
  if (!checkout.splitPayment && input.paymentMethod === "Split") throw new Error("Split payment is disabled");
  if (!checkout.allowItemNotes && input.items.some(item => item.note)) throw new Error("Item notes are disabled");
  if (!checkout.allowCustomQuantity && input.items.some(item => item.quantity % checkout.defaultQuantity !== 0)) throw new Error(`Use quantities in multiples of ${checkout.defaultQuantity}`);
  if (!checkout.cashAmountEntry && input.cashReceived !== undefined) throw new Error("Cash amount entry is disabled");
}
