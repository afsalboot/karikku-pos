import { cents } from "./calculations.js";

function configuration(item) {
  return JSON.stringify([
    item.productId,
    item.variantId || null,
    [...(item.addonIds || [])].sort(),
    item.note || "",
    cents(item.unitTotal),
  ]);
}

export function addCartItem(items, incoming) {
  const match = items.findIndex(
    (item) => configuration(item) === configuration(incoming),
  );
  if (match === -1) return [...items, incoming];
  return items.map((item, index) =>
    index === match
      ? { ...item, quantity: Math.min(999, item.quantity + incoming.quantity) }
      : item,
  );
}
