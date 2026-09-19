"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CartPanel from "./cart-panel";

export default function MobileCartSheet({ cartProps, onClose }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dragged = useRef(false);
  const closingRef = useRef(false);
  const afterCloseRef = useRef(null);
  const closeTimer = useRef(null);
  function finishClose() {
    if (!closingRef.current) return;
    closingRef.current = false;
    clearTimeout(closeTimer.current);
    closeRef.current();
    afterCloseRef.current?.();
  }
  function requestClose(afterClose) {
    if (closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = typeof afterClose === "function" ? afterClose : null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(finishClose, 260);
  }
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const swipe = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => { if (desktop.matches) closeRef.current(); };
    dialog.showModal();
    document.body.style.overflow = "hidden";
    desktop.addEventListener("change", onResize);
    return () => {
      clearTimeout(closeTimer.current);
      desktop.removeEventListener("change", onResize);
      dialog.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="mobile-cart-sheet" data-expanded={expanded} data-state={closing ? "closing" : "open"} aria-label="Current Sale" onAnimationEnd={event => {
      if (event.target === event.currentTarget && event.animationName === "mobile-cart-exit") finishClose();
    }} onCancel={event => {
      event.preventDefault(); requestClose();
    }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) requestClose();
    }}>
      <button type="button" className="mobile-cart-handle" aria-label={expanded ? "Restore cart sheet" : "Expand cart to full screen"} aria-expanded={expanded}
      onClick={event => {
        if (event.detail === 0 || !dragged.current) setExpanded(value => !value);
        dragged.current = false;
      }} onPointerDown={event => {
        dragged.current = false;
        swipe.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerUp={event => {
        const start = swipe.current;
        swipe.current = null;
        if (!start) return;
        const distance = event.clientY - start.y;
        dragged.current = Math.abs(distance) > 8 || Math.abs(event.clientX - start.x) > 8;
        if (Math.abs(event.clientX - start.x) >= 60) return;
        if (distance < -40) setExpanded(true);
        else if (distance > 50) {
          if (expanded) setExpanded(false);
          else requestClose();
        }
      }} onPointerCancel={() => { swipe.current = null; dragged.current = true; }}><span aria-hidden="true" /></button>
      <CartPanel {...cartProps} onClose={() => requestClose()}
        onProceed={() => requestClose(cartProps.onProceed)}
        onClear={() => requestClose(cartProps.onClear)} />
    </dialog>, document.body,
  );
}
