import { ArrowRight, ShoppingBasket, X } from "lucide-react";
import { formatCurrency } from "@/lib/client";
import CartItem from "./cart-item";

function DiscountControl({ discount, setDiscount, settings }) {
  return (
    <div>
      <span className="mb-2 block text-xs text-[#6a756c]">Discount</span>
      <div className="flex gap-3">
        <div
          className="flex rounded-lg border border-[#dfe6d9] p-0.5"
          role="group"
          aria-label="Discount type"
        >
          {[
            ["fixed", "₹", "Fixed discount"],
            ["percentage", "%", "Percentage discount"],
          ].filter(([value])=>!settings.discounts || settings.discounts.types.includes(value)).map(([value, label, name]) => (
            <button
              type="button"
              key={value}
              aria-label={name}
              aria-pressed={discount.type === value}
              className={`h-9 w-11 rounded-md text-sm font-semibold transition-colors ${discount.type === value ? "bg-[#245b3a] text-white" : "text-[#6a756c] hover:bg-[#eaf2e5]"}`}
              onClick={() => setDiscount({ ...discount, type: value })}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className="min-w-0 flex-1 rounded-lg border border-[#dfe6d9] px-3 text-right text-sm tabular-nums"
          aria-label="Discount value"
          type="number"
          min="0"
          step="0.01"
          value={discount.value}
          onChange={(e) =>
            setDiscount({
              ...discount,
              value: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
        />
      </div>
      {settings.discounts?.requireReason && <label className="field">Discount reason<input maxLength={200} value={discount.reason || ""} onChange={e=>setDiscount({...discount,reason:e.target.value})}/></label>}
    </div>
  );
}
export default function CartPanel({
  cart,
  user,
  settings,
  pending,
  totals,
  calculationError,
  onProceed,
  onClear,
  onClose,
}) {
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <aside
      id={onClose ? "mobile-current-sale" : "current-sale"}
      tabIndex={-1}
      aria-label="Current Sale"
      className="pos-cart flex min-w-0 scroll-mt-5 flex-col overflow-hidden rounded-[14px] border border-[#e3e8e0] bg-white shadow-sm"
    >
      <div className="pos-cart-header flex shrink-0 items-center justify-between gap-3 border-b border-[#e3e8e0] px-5 py-4">
        <div>
          <h2>Current Sale</h2>
          <p className="mt-1 text-xs text-[#6a756c]" aria-live="polite">
            {count} {count === 1 ? "item" : "items"}
          </p>
        </div>
        <button
          type="button"
          className="min-h-9 rounded-lg px-2 text-xs text-[#a45950] hover:bg-red-50"
          disabled={pending || !cart.items.length}
          onClick={onClear}
        >
          Clear cart
        </button>
        {onClose && <button type="button" className="mobile-cart-close" aria-label="Close cart" onClick={onClose}><X size={20} /></button>}
      </div>
      <fieldset
        disabled={pending}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="pos-cart-items min-h-[170px] flex-1 overflow-y-auto overscroll-contain px-5 lg:min-h-0">
          {cart.items.length ? (
            cart.items.map((item) => (
              <CartItem key={item.key} item={item} cart={cart} settings={settings.checkout} />
            ))
          ) : (
            <div className="flex h-full min-h-[170px] flex-col items-center justify-center gap-2 py-8 text-center">
              <span className="mb-2 grid h-14 w-14 place-items-center rounded-full bg-[#f0f5eb] text-[#799568]">
                <ShoppingBasket size={26} />
              </span>
              <strong className="text-sm text-[#445248]">
                Your cart is empty
              </strong>
              <p className="text-xs text-[#6a756c]">
                Select a product to start this sale.
              </p>
            </div>
          )}
        </div>
        <div className="pos-cart-footer shrink-0 space-y-3 border-t border-[#e3e8e0] bg-[#fcfdfb] px-5 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-[#6a756c]">Subtotal</span>
            <strong>{formatCurrency(cart.calculateSubtotal())}</strong>
          </div>
          {settings.discountEnabled !== false && (
            <DiscountControl
              settings={settings}
              discount={cart.discount}
              setDiscount={cart.setDiscount}
            />
          )}
          {totals?.discount.amount > 0 && (
            <div className="flex justify-between text-xs text-[#6a756c]">
              <span>Discount</span>
              <span>−{formatCurrency(totals.discount.amount)}</span>
            </div>
          )}
          {settings.gstEnabled && (
            <div className="flex justify-between text-xs text-[#6a756c]">
              <span>GST ({settings.taxRate}%)</span>
              <span>{formatCurrency(totals?.tax.amount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#e3e8e0] pt-3 text-2xl font-bold text-[#245b3a]">
            <span>Total</span>
            <span>{formatCurrency(totals?.total)}</span>
          </div>
          {calculationError && (
            <p className="text-xs text-red-800" role="alert">
              {calculationError}
            </p>
          )}
          <button
            type="button"
            className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-[10px] bg-[#245b3a] px-4 font-semibold text-white transition-colors hover:bg-[#3d704c] active:bg-[#19452b] disabled:opacity-50"
            disabled={pending || !cart.items.length || !totals}
            onClick={onProceed}
          >
            Proceed Payment
            <ArrowRight size={19} aria-hidden="true" />
          </button>
        </div>
      </fieldset>
    </aside>
  );
}
