"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { receiptDefaults } from "@/lib/settings-config";
import { useReactToPrint } from "react-to-print";
import { Printer, Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/client";
import Modal from "@/components/modal";
import PaymentBreakdown from "./payment-breakdown";
import { useData } from "@/hooks/useData";
import { printThermalReceipt } from "@/lib/receipt-print";
export function Receipt({ sale, contentRef, loyaltyEnabled = false }) {
  const preferences = { ...receiptDefaults, ...sale.business.receipt };
  const showLoyalty = preferences.showLoyalty && loyaltyEnabled;
  const receiptDate = formatDate(sale.createdAt).replace(",", " •");
  return (
    <article
      ref={contentRef}
      className="receipt"
      style={{ width: sale.business.receiptSize || "80mm" }}
    >
      <header className="receipt-header">
        {preferences.showLogo && sale.business.logo && (
          <img
            src={sale.business.logo}
            alt="Shop logo"
            width="70"
            height="70"
          />
        )}
      </header>
      <hr />
      <div className="receipt-meta"><strong>RECEIPT</strong><strong>{sale.status === "COMPLETED" ? "PAID" : sale.status}</strong></div>
      <p className="receipt-number">{sale.invoiceNumber}</p>
      <p className="receipt-date">{receiptDate}</p>
      {preferences.showCustomer && sale.customer && (
        <>
          <p>Customer: {sale.customer.name}</p>
          <p>Phone: {sale.customer.phone}</p>
        </>
      )}
      {preferences.showCashier && sale.cashier?.name && <p>Cashier: {sale.cashier.name}</p>}
      <div className="receipt-columns"><span>ITEM / QTY × RATE</span><span>AMOUNT</span></div>
      {sale.items.map((item, index) => (
        <section className="receipt-item" key={index}>
          <strong>{item.productName}</strong>
          {item.variant && <p>{item.variant.name}</p>}
          <div className="receipt-item-pricing">
            <span>
              {item.quantity} × {formatCurrency(item.unitPrice)}
            </span>
            <span>{formatCurrency(item.quantity * item.unitPrice)}</span>
          </div>
          {(item.addons || []).map((addon, i) => (
            <div className="receipt-item-addon" key={i}>
              <span>
                + {addon.name} ({item.quantity})
              </span>
              <span>{formatCurrency(addon.price * item.quantity)}</span>
            </div>
          ))}
          {item.note && <p>Note: {item.note}</p>}
        </section>
      ))}
      <hr />
      <div className="receipt-total">
        <span>Subtotal</span>
        <span>{formatCurrency(sale.subtotal)}</span>
      </div>
      {sale.discount.amount > 0 && <div className="receipt-total">
        <span>Discount</span>
        <span>−{formatCurrency(sale.discount.amount)}</span>
      </div>}
      {sale.loyaltyDiscount > 0 && <div className="receipt-total"><span>Rewards discount</span><span>−{formatCurrency(sale.loyaltyDiscount)}</span></div>}
      {sale.tax?.enabled && (
        <div className="receipt-total">
          <span>GST ({sale.tax.rate}%)</span>
          <span>{formatCurrency(sale.tax.amount)}</span>
        </div>
      )}
      <hr />
      <div className="receipt-total grand">
        <strong>TOTAL</strong>
        <strong>{formatCurrency(sale.total)}</strong>
      </div>
      {preferences.showPayment && <PaymentBreakdown sale={sale} />}
      {showLoyalty && sale.loyaltySummary && <section className="receipt-loyalty">{sale.loyaltySummary.cashbackEarned > 0 && <p>Cashback earned: {formatCurrency(sale.loyaltySummary.cashbackEarned)}</p>}{sale.loyaltySummary.stampEarned > 0 && <p>Stamps earned: {sale.loyaltySummary.stampEarned}</p>}{sale.loyaltySummary.walletRedeemed > 0 && <p>Wallet used: {formatCurrency(sale.loyaltySummary.walletRedeemed)}</p>}{sale.loyaltySummary.rewardsUnlocked?.length > 0 && <p>Rewards earned: {sale.loyaltySummary.rewardsUnlocked.join(", ")}</p>}</section>}
      <hr />
      <footer>Thank you!<br />Visit again</footer>
    </article>
  );
}
export function ReceiptPrintContent({ sale, contentRef, loyaltyEnabled }) {
  return <div ref={contentRef}>{Array.from({length: Math.min(5, sale.business.receipt?.copies || 1)}, (_, i)=><div key={i} style={{breakAfter: i < (sale.business.receipt?.copies || 1)-1 ? "page" : "auto"}}><Receipt sale={sale} loyaltyEnabled={loyaltyEnabled}/></div>)}</div>;
}
export function AutomaticReceiptPrint({ sale, onDone }) {
  const settings = useData("/settings");
  const contentRef=useRef(null), started=useRef(false);
  const print=useReactToPrint({contentRef,documentTitle:sale.invoiceNumber,onAfterPrint:onDone,onPrintError:onDone,print:printThermalReceipt});
  useEffect(()=>{if(!settings.loading && !started.current){started.current=true;print();}},[print, settings.loading]);
  return <div style={{position:"fixed",left:"-10000px",top:0}} aria-hidden="true"><ReceiptPrintContent sale={sale} contentRef={contentRef} loyaltyEnabled={settings.data?.loyaltyEnabled === true}/></div>;
}
export function ReceiptModal({ sale, onClose, success = false, autoPrint = false }) {
  const settings = useData("/settings");
  const contentRef = useRef(null);
  const started = useRef(false);
  const print = useReactToPrint({
    contentRef,
    documentTitle: sale.invoiceNumber,
    print: printThermalReceipt,
  });
  useEffect(()=>{if(autoPrint && !settings.loading && !started.current){started.current=true;print();}},[autoPrint,print,settings.loading]);
  return (
    <Modal
      title={success ? "Payment Successful" : sale.invoiceNumber}
      onClose={onClose}
    >
      <div
        className={`receipt-preview ${success ? "payment-success-preview" : ""}`}
      >
        {success && (
          <div className="invoice-printer" aria-hidden="true">
            <Printer size={22} />
            <span />
          </div>
        )}
        <div className={success ? "invoice-print-sheet" : undefined} ref={contentRef}>
          <Receipt sale={sale} loyaltyEnabled={settings.data?.loyaltyEnabled === true} />
          {Array.from({length:Math.max(0,Math.min(5,sale.business.receipt?.copies||1)-1)},(_,i)=><div className="receipt-extra-copy" key={i}><Receipt sale={sale} loyaltyEnabled={settings.data?.loyaltyEnabled === true}/></div>)}
        </div>
      </div>
      <footer className="modal-footer">
        <button
          className="button secondary"
          aria-label="Print Bill"
          title="Print invoice"
          disabled={settings.loading}
          onClick={() => print()}
        >
          <Printer size={20} />
          {!success && "Print Bill"}
        </button>
        <button className="button primary" onClick={onClose}>
          {success && <Plus size={18} />}
          {success ? "New Sale" : "Close"}
        </button>
      </footer>
    </Modal>
  );
}
