import ProductImage from "./product-image";
import { useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/client";

export default function CartItem({ item, cart, settings = {} }) {
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <article className="pos-cart-item border-b border-[#edf1e9] py-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[#f0f4ec]">
          <ProductImage src={item.imageUrl} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm leading-5 break-words">
            {item.name}
          </strong>
          <small className="mt-0.5 block text-[11px] text-[#6a756c]">
            {[item.categoryName, item.variantName].filter(Boolean).join(" · ")}
          </small>
          {item.addonNames.length > 0 && (
            <small className="block text-[11px] text-[#6a756c]">
              + {item.addonNames.join(", ")}
            </small>
          )}
          <small className="mt-1 block text-xs font-medium text-[#245b3a]">
            {formatCurrency(item.unitTotal)} each
          </small>
        </div>
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#9d5c54] hover:bg-red-50"
          aria-label={`Remove ${item.name}`}
          onClick={() => cart.removeItem(item.key)}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="pos-quantity mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center rounded-lg border border-[#dfe6d9]">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-l-lg hover:bg-[#eaf2e5] active:bg-[#dbe8d2]"
            aria-label={`Decrease ${item.name}`}
            disabled={settings.allowCustomQuantity === false || item.quantity <= 1}
            onClick={() => cart.decreaseQuantity(item.key)}
          >
            <Minus size={15} />
          </button>
          <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
            {item.quantity}
          </span>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-r-lg hover:bg-[#eaf2e5] active:bg-[#dbe8d2]"
            aria-label={`Increase ${item.name}`}
            disabled={settings.allowCustomQuantity === false || item.quantity >= 999}
            onClick={() => cart.increaseQuantity(item.key)}
          >
            <Plus size={15} />
          </button>
        </div>
        <strong className="text-sm tabular-nums">
          {formatCurrency(item.unitTotal * item.quantity)}
        </strong>
      </div>
      {settings.allowItemNotes !== false && (noteOpen || item.note ? (
        <input
          className="mt-3 min-h-9 w-full rounded-lg border border-[#e3e8e0] px-3 text-xs"
          aria-label={`Note for ${item.name}`}
          maxLength={200}
          placeholder="Add a note (optional)"
          value={item.note}
          onChange={(e) => cart.setNote(item.key, e.target.value)}
          autoFocus={noteOpen}
        />
      ) : (
        <button
          type="button"
          className="mt-1 flex min-h-9 items-center gap-1 text-xs text-[#6a756c] hover:text-[#245b3a]"
          onClick={() => setNoteOpen(true)}
          aria-label={`Add note for ${item.name}`}
        >
          <Plus size={13} />
          Add note
        </button>
      ))}
    </article>
  );
}
