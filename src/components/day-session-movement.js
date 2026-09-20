"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/modal";
import { api } from "@/lib/client";
import { movementCategories, validCash } from "@/lib/day-closing";
export default function MovementModal({ day, onClose, onSaved }) {
  const [type, setType] = useState("IN"),
    [category, setCategory] = useState("Float Added"),
    [amount, setAmount] = useState(""),
    [note, setNote] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    request = useRef(null);
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    const payload = {
      action: "movement",
      sessionId: day._id,
      type,
      category,
      amount: Number(amount),
      note,
    };
    const fingerprint = JSON.stringify(payload);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    try {
      await api("/day-sessions", {
        method: "POST",
        body: { ...payload, requestId: request.current.id },
      });
      toast.success("Cash movement recorded");
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Modal title="Add Cash Movement" closable={!pending} onClose={onClose}>
      <form onSubmit={save}>
        <div className="modal-body drawer-form">
          <fieldset disabled={pending}>
            <label>
              Movement Type
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setCategory(movementCategories[e.target.value][0]);
                }}
              >
                <option value="IN">Cash In</option>
                <option value="OUT">Cash Out</option>
              </select>
            </label>
            <label>
              Category
              <select
                aria-label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {movementCategories[type].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Amount (₹)
              <input
                type="number"
                required
                min="0.01"
                max="1000000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Note
              <textarea
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="error-panel">
              {error}
            </p>
          )}
        </div>
        <footer className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button primary"
            disabled={pending || !validCash(amount) || Number(amount) <= 0}
          >
            {pending ? "Recording…" : "Record Movement"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
