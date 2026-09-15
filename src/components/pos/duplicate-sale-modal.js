import { useEffect, useState } from "react";
import { api, formatCurrency } from "@/lib/client";
import { duplicateItems } from "@/lib/duplicate-sale";
import Modal from "@/components/modal";
export default function DuplicateSaleModal({ id, onClose, onUse }) {
  const [state, setState] = useState({ data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const sale = await api(`/sales/${id}`, { signal: controller.signal });
        const products = await Promise.all(
          [...new Set(sale.items.map((item) => item.productId))].map(
            (productId) =>
              api(`/products/${productId}`, { signal: controller.signal }),
          ),
        );
        setState({
          data: { sale, items: duplicateItems(sale, products) },
          error: "",
        });
      } catch (error) {
        if (error.name !== "AbortError")
          setState({ data: null, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [id]);
  return (
    <Modal title="Duplicate Sale" onClose={onClose}>
      <div className="modal-body">
        {state.error ? (
          <p role="alert">{state.error}</p>
        ) : !state.data ? (
          <p role="status">Checking current products and prices…</p>
        ) : (
          <>
            <p>
              Copy items from {state.data.sale.invoiceNumber} into a new sale.
            </p>
            <p className="muted">
              Current prices apply. Discount and payment selection start fresh.
            </p>
            <div className="mt-4 space-y-3">
              {state.data.items.map((item, index) => (
                <div key={index} className="flex justify-between gap-3 text-sm">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <strong>
                    {formatCurrency(item.unitTotal * item.quantity)}
                  </strong>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <footer className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!state.data}
          onClick={() => onUse(state.data)}
        >
          Use items
        </button>
      </footer>
    </Modal>
  );
}
