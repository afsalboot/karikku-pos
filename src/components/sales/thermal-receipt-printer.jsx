"use client";
import PaymentSuccessAnimation from "../payment/PaymentSuccessAnimation";
export default function ThermalReceiptPrinter({ invoice, children }) {
  return <PaymentSuccessAnimation transactionId={invoice.invoiceNumber}>{children}</PaymentSuccessAnimation>;
}
