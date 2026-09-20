"use client";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./pickers.css";

export default function PickerPanel({ anchor, onClose, children, className = "", id, role, label }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const panel = ref.current;
    panel.showPopover?.();
    function position() {
      if (!anchor.isConnected || anchor.matches(":disabled")) { onClose(); return; }
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      const offsetX = viewport?.offsetLeft || 0, offsetY = viewport?.offsetTop || 0;
      panel.style.width = `${Math.min(width - 24, Math.max(className.includes("calendar") ? 296 : 220, rect.width))}px`;
      panel.style.maxHeight = `${Math.max(120, height - 24)}px`;
      const size = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(offsetX + 12, Math.min(rect.left, offsetX + width - size.width - 12))}px`;
      const below = rect.bottom + 7;
      panel.style.top = `${Math.max(offsetY + 12, below + size.height <= offsetY + height - 12 ? below : rect.top - size.height - 7)}px`;
    }
    position();
    function dismiss(e) {
      if (!panel.contains(e.target) && e.target !== anchor) onClose();
    }
    function keyboard(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); anchor.focus(); }
    }
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss);
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const observer = new ResizeObserver(position); observer.observe(panel);
    return () => {
      observer.disconnect(); panel.hidePopover?.();
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss);
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [anchor, onClose, className]);
  return createPortal(<div ref={ref} popover="manual" id={id} role={role} aria-label={label} className={`picker-panel ${className}`}>{children}</div>, anchor.closest("dialog") || document.body);
}
