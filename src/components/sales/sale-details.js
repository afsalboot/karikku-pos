"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useData } from "@/hooks/useData";
import { api, formatCurrency, formatDate } from "@/lib/client";
import { useAuth } from "@/components/layout/app-shell";
import { PageHeading, Notice } from "@/components/ui/shared";
import Modal from "@/components/modal";
import { ReceiptModal } from "./receipt";
import SaleDrawerContent from "./sale-drawer-content";
import PaymentBreakdown from "./payment-breakdown";
export default function SaleDetails({
  id,
  embedded = false,
  onClose,
  onUpdated,
  initialAction = "",
}) {
  const result = useData(`/sales/${id}`);
  const { user } = useAuth();
  const [printing, setPrinting] = useState(false);
  const [action, setAction] = useState("");
  useEffect(() => {
    if (!initialAction) return;
    const timer = setTimeout(() => setAction(initialAction), 0);
    return () => clearTimeout(timer);
  }, [initialAction]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function update(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api(`/sales/${id}`, {
        method: "PATCH",
        body: {
          status: action,
          reason: new FormData(event.currentTarget).get("reason"),
        },
      });
      setAction("");
      result.refresh();
      onUpdated?.();
      toast.success("Sale status updated");
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  const s = result.data;
  return (
    <>
      {!embedded && (
        <Link className="text-link" href="/sales">
          ← Sales history
        </Link>
      )}
      <Notice {...result} retry={result.refresh}>
        {s &&
          (embedded ? (
            <SaleDrawerContent
              sale={s}
              onPrint={() => setPrinting(true)}
              onAction={setAction}
              admin={user.role === "ADMIN"}
              onClose={onClose}
            />
          ) : (
            <>
              <PageHeading
                title={s.invoiceNumber}
                description={`${formatDate(s.createdAt)} · ${s.cashier.name}`}
              >
                <button
                  className="button primary"
                  onClick={() => setPrinting(true)}
                >
                  Print / Reprint
                </button>
              </PageHeading>
              <section className="panel">
                <div className="detail-meta">
                  <span>
                    Payment:{" "}
                    <strong>
                      {s.paymentMethod === "UPI"
                        ? "GPay / UPI"
                        : s.paymentMethod}
                    </strong>
                  </span>
                  <span>
                    Status:{" "}
                    <strong>
                      {s.status === "COMPLETED" ? "Paid" : s.status}
                    </strong>
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Quantity</th>
                        <th>Unit price + add-ons</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <strong>{item.productName}</strong>
                            {item.variant && <p>{item.variant.name}</p>}
                            {item.addons.map((a, i) => (
                              <p key={i}>
                                + {a.name} ({formatCurrency(a.price)} each)
                              </p>
                            ))}
                            {item.note && <p>Note: {item.note}</p>}
                          </td>
                          <td>{item.quantity}</td>
                          <td>
                            {formatCurrency(item.unitPrice + item.addonTotal)}
                          </td>
                          <td>{formatCurrency(item.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="totals-block">
                  <p>
                    Subtotal <strong>{formatCurrency(s.subtotal)}</strong>
                  </p>
                  <p>
                    Discount{" "}
                    <strong>−{formatCurrency(s.discount.amount)}</strong>
                  </p>
                  {s.tax?.enabled && (
                    <p>
                      GST ({s.tax.rate}%){" "}
                      <strong>{formatCurrency(s.tax.amount)}</strong>
                    </p>
                  )}
                  <p>
                    Total <strong>{formatCurrency(s.total)}</strong>
                  </p>
                </div>
                <PaymentBreakdown sale={s} />
                {s.statusReason && (
                  <p className="status-reason">
                    {s.status}: {s.statusReason}
                  </p>
                )}
                {user.role === "ADMIN" && s.status === "COMPLETED" && (
                  <div className="panel-actions">
                    <button
                      className="button secondary"
                      onClick={() => setAction("CANCELLED")}
                    >
                      Cancel sale
                    </button>
                    <button
                      className="button danger"
                      onClick={() => setAction("REFUNDED")}
                    >
                      Refund sale
                    </button>
                  </div>
                )}
              </section>
            </>
          ))}
      </Notice>
      {printing && s && (
        <ReceiptModal sale={s} onClose={() => setPrinting(false)} />
      )}
      {action && (
        <Modal
          title={action === "REFUNDED" ? "Refund sale" : "Cancel sale"}
          onClose={pending ? () => {} : () => setAction("")}
        >
          <form onSubmit={update}>
            <div className="modal-body">
              <p>
                This changes the recorded sale status. Complete any actual
                payment reversal separately.
              </p>
              <label className="field">
                Reason
                <textarea name="reason" required maxLength={300} />
              </label>
              {error && <p className="form-error">{error}</p>}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button secondary"
                disabled={pending}
                onClick={() => setAction("")}
              >
                Keep sale
              </button>
              <button className="button danger" disabled={pending}>
                {pending ? "Saving…" : "Confirm"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
