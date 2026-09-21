import { formatCurrency } from "@/lib/client";

export default function ReceiptContent({
  items = [],
  subtotal,
  tax,
  discount = 0,
  total,
  paymentMethod,
  transactionId,
  date,
  customer,
  footer = "THANK & VISIT AGAIN",
}) {
  return (
    <article className="animated-receipt-content">
      <header>
        <p>PAYMENT SUCCESSFUL</p>
        <strong>{formatCurrency(total)}</strong>
        <small>
          {date &&
            new Date(date).toLocaleDateString("en-IN", {
              timeZone: "Asia/Kolkata",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}{" "}
          · {paymentMethod}
        </small>
        <small>{transactionId}</small>
        {customer && <small>{customer}</small>}
      </header>
      <div className="animated-receipt-items">
        {items.map((item, index) => (
          <div className="animated-receipt-row" key={item._id || index}>
            <span>
              {item.quantity ?? item.qty}X {item.productName || item.name}
              {item.variant?.name && <small>{item.variant.name}</small>}
              {item.addons?.map((addon, i) => (
                <small key={i}>+ {addon.name}</small>
              ))}
            </span>
            <span>
              {formatCurrency(
                item.lineTotal ??
                  (item.quantity ?? item.qty) * (item.unitPrice ?? item.price),
              )}
            </span>
          </div>
        ))}
      </div>
      <section className="animated-receipt-totals">
        <div className="animated-receipt-row">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="animated-receipt-row">
            <span>Discount</span>
            <span>−{formatCurrency(discount)}</span>
          </div>
        )}
        {(typeof tax === "number" ? tax > 0 : tax?.enabled) && (
          <div className="animated-receipt-row">
            <span>Tax{tax?.rate != null ? ` (${tax.rate}%)` : ""}</span>
            <span>
              {formatCurrency(typeof tax === "number" ? tax : tax.amount)}
            </span>
          </div>
        )}
      </section>
      <div className="animated-receipt-row animated-receipt-total">
        <strong>TOTAL</strong>
        <strong>{formatCurrency(total)}</strong>
      </div>
      <footer>{footer}</footer>
    </article>
  );
}
