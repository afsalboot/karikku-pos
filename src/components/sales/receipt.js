"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { receiptDefaults } from "@/lib/settings-config";
import { useReactToPrint } from "react-to-print";
import { Printer, Plus, MapPin, Phone } from "lucide-react";
import { formatCurrency } from "@/lib/client";
import Modal from "@/components/modal";
import PaymentBreakdown from "./payment-breakdown";
import { useData } from "@/hooks/useData";
import { printThermalReceipt } from "@/lib/receipt-print";
import ThermalReceiptPrinter from "./thermal-receipt-printer";
export function Receipt({ sale, contentRef, loyaltyEnabled = false }) {
  const preferences = { ...receiptDefaults, ...sale.business.receipt };
  const showLoyalty = preferences.showLoyalty && loyaltyEnabled;
  const createdAt = new Date(sale.createdAt);
  const receiptDate = createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  const receiptTime = createdAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
  return (
    <article
      ref={contentRef}
      className="receipt"
      style={{ width: sale.business.receiptSize || "80mm" }}
    >
      <header className="receipt-header">
        {preferences.showLogo && <div className="receipt-brand"><img src="/receipt-logo.jpeg" alt="Karikku Juice Shop" width="1024" height="1536" /></div>}
        {!preferences.showLogo && <h2>Karikku Juice Shop</h2>}
        <p className="receipt-address"><MapPin size={17} aria-hidden="true" /><span>Thrissur Rd, near Mars Theatre,<br />Changaramkulam, Kerala 679591, India</span></p>
        <p className="receipt-phone"><Phone size={17} aria-hidden="true" /><span>Ph 9526532437</span></p>
      </header>
      <hr />
      <p className="receipt-number">No: {sale.invoiceNumber}</p>
      {sale.status !== "COMPLETED" && <p className="receipt-status">{sale.status}</p>}
      <p className="receipt-date">Date <span>: {receiptDate}</span></p>
      <p className="receipt-date">Time <span>: {receiptTime}</span></p>
      {preferences.showCustomer && sale.customer && (
        <>
          <p>Customer: {sale.customer.name}</p>
          <p>Phone: {sale.customer.phone}</p>
        </>
      )}
      {preferences.showCashier && sale.cashier?.name && <p className="receipt-date">Cashier <span>: {sale.cashier.name}</span></p>}
      <div className="receipt-columns"><span>NO.</span><span>ITEM / QTY × RATE</span><span>AMOUNT</span></div>
      {sale.items.map((item, index) => (
        <section className="receipt-item" key={index}>
          <span className="receipt-item-number">{index + 1}</span>
          <div className="receipt-item-description"><strong>{item.productName}</strong>
          {item.variant && <p>{item.variant.name}</p>}
          <div className="receipt-item-pricing">
            <span>
              {item.quantity} × {formatCurrency(item.unitPrice)}
            </span>
          </div>
          {(item.addons || []).map((addon, i) => (
            <div className="receipt-item-addon" key={i}>
              <span>
                + {addon.name} ({item.quantity})
              </span>
              <span>{formatCurrency(addon.price)} each</span>
            </div>
          ))}
          {item.note && <p>Note: {item.note}</p>}</div>
          <span className="receipt-item-amount">{formatCurrency(item.lineTotal ?? item.quantity * (item.unitPrice + (item.addons || []).reduce((sum, addon) => sum + addon.price, 0)))}</span>
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
      {preferences.showPayment && <PaymentBreakdown sale={sale} showAmountPaid />}
      {showLoyalty && sale.loyaltySummary && <section className="receipt-loyalty">{sale.loyaltySummary.cashbackEarned > 0 && <p>Cashback earned: {formatCurrency(sale.loyaltySummary.cashbackEarned)}</p>}{sale.loyaltySummary.stampEarned > 0 && <p>Stamps earned: {sale.loyaltySummary.stampEarned}</p>}{sale.loyaltySummary.walletRedeemed > 0 && <p>Wallet used: {formatCurrency(sale.loyaltySummary.walletRedeemed)}</p>}{sale.loyaltySummary.rewardsUnlocked?.length > 0 && <p>Rewards earned: {sale.loyaltySummary.rewardsUnlocked.join(", ")}</p>}</section>}
      <hr />
      <footer>{sale.business.footer && !/^Thank you[.!]?\s*Visit again[.!]?$/i.test(sale.business.footer.trim())
        ? <span>{sale.business.footer}</span>
        : <><strong>Thank you!</strong><span>Visit again</span></>}</footer>
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
  const renderReceipt = invoice => <>
    <Receipt sale={invoice} loyaltyEnabled={settings.data?.loyaltyEnabled === true} />
    {Array.from({length:Math.max(0,Math.min(5,invoice.business.receipt?.copies||1)-1)},(_,i)=><div className="receipt-extra-copy" key={i}><Receipt sale={invoice} loyaltyEnabled={settings.data?.loyaltyEnabled === true}/></div>)}
  </>;
  return (
    <Modal
      title={success ? "Payment Successful" : sale.invoiceNumber}
      onClose={onClose}
    >
      <div
        className={`receipt-preview ${success ? "payment-success-preview" : ""}`}
      >
        {success
          ? <ThermalReceiptPrinter key={sale._id || sale.invoiceNumber} invoice={sale} renderReceipt={renderReceipt} contentRef={contentRef} />
          : <div ref={contentRef}>{renderReceipt(sale)}</div>}
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
