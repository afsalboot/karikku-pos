"use client";

import { useEffect, useRef, useState } from "react";

// The renderer receives the actual invoice, so the animation never maintains a
// second invoice template. Keep the print ref inside the animated wrapper.
export default function ThermalReceiptPrinter({ invoice, renderReceipt, contentRef }) {
  const [phase, setPhase] = useState("idle");
  const viewportRef = useRef(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let frame;
    let timer;
    const finish = () => setPhase("completed");
    const onMotionChange = () => {
      if (motion.matches) {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        finish();
      }
    };
    motion.addEventListener("change", onMotionChange);
    async function start() {
      if (!motion.matches) {
        // Reserve the final paper size before feeding it through the slot.
        await Promise.race([
          Promise.all([...viewport.querySelectorAll("img")].map(img => img.decode().catch(() => {}))),
          new Promise(resolve => { timer = setTimeout(resolve, 200); }),
        ]);
      }
      if (cancelled) return;
      clearTimeout(timer);
      viewport.style.setProperty("--paper-feed-distance", `${viewport.clientHeight}px`);
      frame = requestAnimationFrame(() => {
        if (motion.matches) finish();
        else {
          setPhase("printing");
          // Also completes when browser animation events are unavailable.
          timer = setTimeout(finish, 2150);
        }
      });
    }
    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      motion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <section
      className="thermal-printer"
      data-state={phase}
      style={{ "--receipt-width": invoice.business?.receiptSize === "58mm" ? "58mm" : "80mm" }}
      aria-label={`Receipt for ${invoice.invoiceNumber}`}
    >
      <div className="thermal-feed-window" ref={viewportRef} tabIndex={phase === "completed" ? 0 : -1} role="region" aria-label="Invoice details">
        <div className="thermal-paper" onAnimationEnd={event => {
          if (event.target === event.currentTarget) setPhase("completed");
        }}>
          <div ref={contentRef}>{renderReceipt(invoice)}</div>
          <div className="thermal-paper-edge" aria-hidden="true" />
        </div>
      </div>
      <div className="thermal-printer-body" aria-hidden="true"><span className="thermal-printer-slot" /></div>
      <span className="sr-only" role="status">{phase === "completed" ? "Receipt ready" : "Preparing receipt"}</span>
    </section>
  );
}
