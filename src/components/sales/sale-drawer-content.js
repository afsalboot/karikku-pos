import { paymentLabel } from "@/lib/payments";
import PaymentBreakdown from "./payment-breakdown";
import { formatCurrency } from "@/lib/client";
import { saleDate, statusLabel } from "./history-utils";
export default function SaleDrawerContent({
  sale: s,
  onPrint,
  onAction,
  admin,
  onClose,
}) {
  return (
    <div className="sale-drawer-content">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-[#245b3a]">
          {s.invoiceNumber}
        </h3>
        <p className="mt-1 text-xs text-[#6a756c]">
          {saleDate(s.createdAt)} · {saleDate(s.createdAt, true)} IST
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-[#f4f7f0] p-4 text-sm">
        <div>
          <dt className="text-xs text-[#6a756c]">Cashier</dt>
          <dd>{s.cashier.name}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#6a756c]">Customer</dt>
          <dd>
            {s.customer?.name || "Walk-in"}
            {s.customer?.phone && (
              <small className="block">{s.customer.phone}</small>
            )}
          </dd>
        </div>
      </dl>
      <h3 className="mt-6 mb-2 text-xs font-semibold tracking-widest text-[#6a756c]">
        ITEMS
      </h3>
      {s.items.map((item, i) => (
        <div className="border-b border-[#e3e8e0] py-3" key={i}>
          <strong className="text-sm">{item.productName}</strong>
          {item.variant && (
            <p className="text-xs text-[#6a756c]">{item.variant.name}</p>
          )}
          {item.addons.map((addon, j) => (
            <p className="text-xs text-[#6a756c]" key={j}>
              + {addon.name} ({formatCurrency(addon.price)} each)
            </p>
          ))}
          <div className="mt-2 flex justify-between text-sm">
            <span>
              {item.quantity} ×{" "}
              {formatCurrency(item.unitPrice + item.addonTotal)}
            </span>
            <strong>{formatCurrency(item.lineTotal)}</strong>
          </div>
          {item.note && <p className="mt-1 text-xs">Note: {item.note}</p>}
        </div>
      ))}
      <div className="space-y-3 py-5 text-sm">
        {[
          ["Subtotal", s.subtotal],
          ["Discount", -s.discount.amount],
          ...(s.tax?.enabled ? [[`GST (${s.tax.rate}%)`, s.tax.amount]] : []),
        ].map(([label, value]) => (
          <div className="flex justify-between" key={label}>
            <span>{label}</span>
            <span>{formatCurrency(value)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-[#e3e8e0] pt-3 text-xl font-bold text-[#245b3a]">
          <span>Total</span>
          <span>{formatCurrency(s.total)}</span>
        </div>
      </div>
      <dl className="flex justify-between gap-4 border-t border-[#e3e8e0] py-4 text-sm">
        <div>
          <dt className="text-xs text-[#6a756c]">Payment method</dt>
          <dd>{paymentLabel(s.paymentMethod)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[#6a756c]">Payment status</dt>
          <dd>{statusLabel(s.status)}</dd>
        </div>
      </dl>
      <PaymentBreakdown sale={s} />
      {s.statusReason && (
        <p className="mb-4 text-sm text-[#6a756c]">Reason: {s.statusReason}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="button primary" onClick={onPrint}>
          Reprint Receipt
        </button>
        <button className="button secondary" onClick={onPrint}>
          Print Invoice
        </button>
        <button className="button secondary" onClick={onClose}>
          Close
        </button>
      </div>
      {admin && s.status === "COMPLETED" && (
        <div className="mt-4 flex gap-4">
          <button
            className="text-xs text-red-800"
            onClick={() => onAction("CANCELLED")}
          >
            Cancel / Void Sale
          </button>
          <button
            className="text-xs text-red-800"
            onClick={() => onAction("REFUNDED")}
          >
            Refund
          </button>
        </div>
      )}
    </div>
  );
}
