import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/modal";
import { api, formatCurrency } from "@/lib/client";
import CheckoutPayment, { usePaymentDraft } from "./checkout-payment";
import { customerSchema } from "@/lib/validation";
import CustomerPicker from "./customer-picker";
import { useData } from "@/hooks/useData";
import LoyaltyPanel from "./loyalty-panel";
import "./loyalty-panel.css";
import { applyLoyaltyPreview, walletLimit, walletInputError } from "@/lib/loyalty-checkout";

export default function PaymentModal({
  cart,
  customer,
  setCustomer,
  totals,
  methods,
  loyaltyEnabled,
  checkoutSettings = {},
  pending,
  error,
  onPay,
  onClose,
}) {
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const emptySelection = { walletAmount: 0, walletInput: "", stampReward: false, birthdayReward: false };
  const [loyaltyState, setLoyaltyState] = useState(emptySelection);
  const customerPicker = useRef(null);
  const submitLock = useRef(false);
  const member = useData(loyaltyEnabled && customer.customerId ? `/loyalty/customer?customerId=${customer.customerId}` : null);
  const configResult = useData(loyaltyEnabled ? "/loyalty/settings" : null);
  const config = configResult.data;
  const selection = loyaltyState;
  const loyalty = { walletAmount: selection.walletAmount, stampReward: selection.stampReward, birthdayReward: selection.birthdayReward, ...(selection.birthdayReward && selection.birthdayProof ? { birthdayProof: selection.birthdayProof } : {}) };
  const setLoyalty = (update) => setLoyaltyState((current) => typeof update === "function" ? update(current) : update);
  const changeCustomer = (value) => { setLoyaltyState(emptySelection); setCustomer(value); };
  const subtotal = Math.max(0, (totals?.subtotal || 0) - (totals?.discount.amount || 0));
  const limitRewards = selection.birthdayReward && selection.birthdayProof && member.data?.rewards
    ? { ...member.data.rewards, birthday: config?.birthday }
    : member.data?.rewards;
  const maximum = walletLimit(config, limitRewards, subtotal, selection);
  const walletError = walletInputError(selection.walletInput, maximum, config?.wallet.minimumRedemption);
  const hasLoyaltySelection = loyaltyEnabled && Boolean(customer.customerId) && (loyalty.walletAmount > 0 || loyalty.stampReward || loyalty.birthdayReward);
  const loyaltyReady = Boolean(member.data?.rewards?.enabled && config?.enabled);
  const preview = useLoyaltyPreview({ customerId: customer.customerId, subtotalAfterDiscount: subtotal, loyalty, enabled: hasLoyaltySelection && !walletError && loyaltyReady });
  const loyaltyBlocked = Boolean(walletError || (hasLoyaltySelection && (!loyaltyReady || preview.loading || preview.error)));
  const checkoutTotals = loyaltyEnabled ? applyLoyaltyPreview(totals, preview.data) : totals;
  const clearLoyalty = () => setLoyaltyState(emptySelection);
  const focusCustomer = () => customerPicker.current?.querySelector("input")?.focus();
  const draft = usePaymentDraft(checkoutTotals?.total || 0, methods, checkoutSettings);
  const customerValid =
    (checkoutSettings.customerPrompt !== "REQUIRED" && !customer.name.trim() && !customer.phone.trim()) ||
    customerSchema.safeParse(customer).success;
  return <div className="checkout-modal-layer">
    <Modal
      closable={!pending}
      title="Checkout"
      description="Review this sale and collect payment."
      onClose={onClose}
    >
      <div className={loyaltyEnabled ? "checkout-with-loyalty" : "checkout-single"}>
      <form
        className="checkout-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!draft.payload || !customerValid || pending || loyaltyBlocked || submitLock.current || !cart.items.length || !checkoutTotals) return;
          submitLock.current = true;
          try { await onPay({ ...draft.payload, ...(hasLoyaltySelection ? { loyalty } : {}) }); }
          finally { submitLock.current = false; }
        }}
      >
        <fieldset disabled={pending} className="modal-body checkout-body">
          <div className="rounded-xl border border-[#e3e8e0] bg-[#f5f8f0] p-5 text-center">
            <p className="text-xs text-[#6a756c]">
              Amount to collect · {count} {count === 1 ? "item" : "items"}
            </p>
            <strong className="mt-2 block text-3xl text-[#245b3a]">
              {formatCurrency(checkoutTotals?.total)}
            </strong>
          </div>
          <div className="max-h-36 space-y-2 overflow-y-auto text-sm">
            {cart.items.map((item) => (
              <div className="flex justify-between gap-4" key={item.key}>
                <span>
                  {item.name} × {item.quantity}
                  {item.variantName && (
                    <small className="block text-[#6a756c]">
                      {item.variantName}
                    </small>
                  )}
                  {item.addonNames.length > 0 && (
                    <small className="block text-[#6a756c]">
                      + {item.addonNames.join(", ")}
                    </small>
                  )}
                </span>
                <strong className="shrink-0">
                  {formatCurrency(item.unitTotal * item.quantity)}
                </strong>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-[#e3e8e0] pt-3 text-xs text-[#6a756c]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(cart.calculateSubtotal())}</span>
            </div>
            {totals?.discount.amount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>−{formatCurrency(totals.discount.amount)}</span>
              </div>
            )}
            {preview.data?.promotional > 0 && <div className="flex justify-between text-[#245b3a]"><span>Loyalty reward</span><span>−{formatCurrency(preview.data.promotional)}</span></div>}
            {preview.data?.wallet > 0 && <div className="flex justify-between text-[#245b3a]"><span>Wallet used</span><span>−{formatCurrency(preview.data.wallet)}</span></div>}
            {totals?.tax.enabled && (
              <div className="flex justify-between">
                <span>GST ({totals.tax.rate}%)</span>
                <span>{formatCurrency(checkoutTotals.tax.amount)}</span>
              </div>
            )}
          </div>
          {checkoutSettings.customerPrompt !== "NEVER" && <div ref={customerPicker}><CustomerPicker customer={customer} setCustomer={changeCustomer} required={checkoutSettings.customerPrompt === "REQUIRED"} /></div>}
          <CheckoutPayment draft={draft} total={checkoutTotals?.total || 0} />
          <p className="flex items-center gap-2 text-xs text-[#6a756c]">
            <ShieldCheck size={16} />
            Confirm payment has been received before completing the sale.
          </p>
          {error && (
            <p className="text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Back to cart
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={
              pending ||
              !cart.items.length ||
              !checkoutTotals ||
              !draft.payload ||
              !customerValid ||
              loyaltyBlocked
            }
          >
            {pending ? (
              <>
                <LoaderCircle
                  size={17}
                  className="animate-spin motion-reduce:animate-none"
                />
                Processing…
              </>
            ) : (
              <>
                Complete Sale · {formatCurrency(checkoutTotals?.total)}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </footer>
      </form>
      {loyaltyEnabled && <LoyaltyPanel key={customer.customerId || "walk-in"} customer={customer} member={member} configResult={configResult} selection={selection} setLoyalty={setLoyalty} preview={preview} maximum={maximum} walletError={walletError} totals={totals} checkoutTotals={checkoutTotals} subtotal={subtotal} pending={pending} clearLoyalty={clearLoyalty} onSelectCustomer={checkoutSettings.customerPrompt !== "NEVER" ? focusCustomer : null} />}
      </div>
    </Modal>
  </div>;
}

function useLoyaltyPreview({ customerId, subtotalAfterDiscount, loyalty, enabled }) {
  const key = enabled && customerId ? JSON.stringify({ customerId, subtotalAfterDiscount, loyalty }) : null;
  const [state, setState] = useState({ key: null, data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    if (!key) return () => controller.abort();
    api("/loyalty/preview", { method: "POST", signal: controller.signal, body: JSON.parse(key) })
      .then((data) => setState({ key, data, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ key, data: null, error: error.message });
      });
    return () => controller.abort();
  }, [key]);
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : "", loading: Boolean(key) && state.key !== key };
}
