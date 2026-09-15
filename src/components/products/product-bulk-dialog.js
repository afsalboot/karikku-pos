"use client";
import { useState } from "react";
import Modal from "../modal";
import { api } from "@/lib/client";
import { toast } from "sonner";

export default function ProductBulkDialog({ action, selected, categories, onClose, onSaved }) {
  const [changes, setChanges] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deleting = action === "delete";
  const set = (key, value) => setChanges(current => {
    const next = { ...current };
    if (value === "") delete next[key];
    else next[key] = key === "basePrice" ? Number(value) : key === "categoryId" ? value : value === "true";
    return next;
  });
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const result = await api("/products/bulk", { method: "PATCH", body: { action, ids: Object.keys(selected), ...(!deleting ? { changes } : {}) } });
      toast.success(`${result.count} products ${deleting ? "deleted" : "updated"}`);
      onSaved();
    } catch (e) { setError(e.message); } finally { setPending(false); }
  }
  return <Modal title={`${deleting ? "Delete" : "Update"} ${Object.keys(selected).length} products`} onClose={pending ? () => {} : onClose}>
    <form onSubmit={submit}>
      <fieldset className="modal-body" disabled={pending}>
        <p>{deleting ? "Permanently remove these products from the catalog? Existing invoices keep their saved product details. This cannot be undone." : "Choose the fields to apply to every selected product. Other fields keep their current values."}</p>
        <details><summary>Review selected products ({Object.keys(selected).length})</summary><ul>{Object.entries(selected).map(([id, name]) => <li key={id}>{name}</li>)}</ul></details>
        {!deleting && <>
          <label className="field">Category<select value={changes.categoryId || ""} onChange={e => set("categoryId", e.target.value)}><option value="">Keep current category</option>{categories.filter(c => c.active).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}</select></label>
          <label className="field">Base price (INR)<input type="number" min="0" max="1000000" step="0.01" placeholder="Keep current price" value={changes.basePrice ?? ""} onChange={e => set("basePrice", e.target.value)} /><small>Variant and add-on prices keep their current values.</small></label>
          {[["active", "Status", "Active", "Inactive"], ["available", "Availability", "Available", "Sold out"], ["special", "Special", "Special", "Regular"]].map(([key, label, yes, no]) => <label className="field" key={key}>{label}<select value={changes[key] === undefined ? "" : String(changes[key])} onChange={e => set(key, e.target.value)}><option value="">Keep current value</option><option value="true">{yes}</option><option value="false">{no}</option></select></label>)}
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </fieldset>
      <footer className="modal-footer"><button type="button" className="button secondary" disabled={pending} onClick={onClose}>Cancel</button><button className={`button ${deleting ? "danger" : "primary"}`} disabled={pending || (!deleting && !Object.keys(changes).length)}>{pending ? "Saving..." : deleting ? "Delete selected products" : "Apply changes"}</button></footer>
    </form>
  </Modal>;
}
