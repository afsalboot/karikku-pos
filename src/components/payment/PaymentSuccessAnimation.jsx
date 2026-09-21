"use client";
import { useEffect, useState } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";
import ThermalPrinter from "./ThermalPrinter";
import AnimatedReceipt from "./AnimatedReceipt";
import "./payment-success.css";

export default function PaymentSuccessAnimation({ children, transactionId }) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState("idle");
  useEffect(() => {
    const paper = scope.current.querySelector(".thermal-paper");
    let cancelled = false;
    let control;
    async function printOnce() {
      // Wait for the real receipt logo before measuring the paper.
      await Promise.all([...paper.querySelectorAll("img")].map(img => img.decode().catch(() => {})));
      if (cancelled) return;
      if (!reduced) {
        const hidden = `translateY(${-paper.offsetHeight + 7}px)`;
        setPhase("printing");
        control = animate(paper, { transform: [hidden, "translateY(0px)"] }, {
          duration: 2.2, ease: [0.22, 1, 0.36, 1],
        });
        await control;
      }
      if (!cancelled) setPhase("completed");
    }
    void printOnce();
    return () => { cancelled = true; control?.stop(); };
  }, [animate, scope, reduced, transactionId]);
  return <section ref={scope} className="thermal-printer" data-state={reduced ? "completed" : phase} aria-label={`Receipt for ${transactionId}`}>
    <div className="thermal-stage"><ThermalPrinter/><AnimatedReceipt>{children}</AnimatedReceipt></div>
    <span className="sr-only" role="status">{phase === "completed" || reduced ? "Receipt ready" : "Printing receipt"}</span>
  </section>;
}
