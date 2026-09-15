import { cents, money } from "./calculations.js";

// Presentation limits only. The existing preview API remains authoritative.
export function walletLimit(config, rewards, subtotal, selection) {
  if (!config?.enabled || !config.wallet?.enabled || !rewards?.enabled) return 0;
  const selected = selection.stampReward || selection.birthdayReward;
  if (selected && !config.allowRewardStacking && !config.wallet.allowWithOtherRewards) return 0;
  let promotion = 0;
  if (selection.stampReward && rewards.stamp)
    promotion = Math.min(subtotal, rewards.stamp.maximumValue);
  if (selection.birthdayReward && rewards.birthday) {
    const { rewardType, rewardValue } = rewards.birthday;
    promotion = rewardType === "WALLET" ? 0 : rewardType === "PERCENTAGE_DISCOUNT"
      ? money(Math.round(cents(subtotal) * rewardValue / 100))
      : Math.min(subtotal, rewardValue);
  }
  const maximum = Math.max(0, Math.min(
    cents(rewards.wallet),
    cents(subtotal) - cents(promotion),
    Math.round(cents(subtotal) * config.wallet.maximumRedemptionPercent / 100),
  ));
  return maximum < cents(config.wallet.minimumRedemption) ? 0 : money(maximum);
}

export function walletInputError(value, maximum, minimum = 0) {
  if (value === "") return "";
  if (!/^\d+(\.\d{0,2})?$/.test(String(value)) || !Number.isFinite(Number(value)))
    return "Enter a positive money amount or 0, with at most two decimal places.";
  if (Number(value) > maximum) return "maximum";
  if (Number(value) > 0 && Number(value) < minimum) return "minimum";
  return "";
}

export function applyLoyaltyPreview(totals, preview) {
  if (!totals || !preview) return totals;
  const loyaltyCents = cents(preview.wallet) + cents(preview.promotional);
  const taxableCents = cents(totals.subtotal) - cents(totals.discount.amount) - loyaltyCents;
  const taxCents = totals.tax.enabled ? Math.round(taxableCents * totals.tax.rate / 100) : 0;
  return { ...totals, loyaltyDiscount: money(loyaltyCents), tax: { ...totals.tax, amount: money(taxCents) }, total: money(taxableCents + taxCents) };
}
