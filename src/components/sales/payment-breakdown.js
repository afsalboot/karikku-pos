import { salePayments, paymentLabel } from "@/lib/payments";
import { formatCurrency } from "@/lib/client";
export default function PaymentBreakdown({ sale }) {
  const payments = salePayments(sale);
  const isSplitPayment = sale.paymentMethod === "Split";
  return (
    <section className="sale-payment-breakdown">
      <strong className="receipt-section-heading">PAYMENT</strong>
      {!isSplitPayment && (
        <div className="receipt-payment-row">
          <span>Method</span>
          <strong>{paymentLabel(sale.paymentMethod)}</strong>
        </div>
      )}
      {isSplitPayment && payments.map((p) => (
        <div className="receipt-payment-row" key={p.method}>
          <span>{paymentLabel(p.method)}</span>
          <span>{formatCurrency(p.amount)}</span>
        </div>
      ))}
      {sale.cashReceived !== undefined && (
        <>
          <div className="receipt-payment-row">
            <span>Cash Received</span>
            <span>{formatCurrency(sale.cashReceived)}</span>
          </div>
          <div className="receipt-payment-row">
            <span>Change</span>
            <span>{formatCurrency(sale.changeGiven)}</span>
          </div>
        </>
      )}
    </section>
  );
}
