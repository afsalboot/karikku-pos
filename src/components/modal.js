"use client";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  description,
  onClose,
  children,
  compact = false,
  drawer = false,
  modeless = false,
  closable = true,
  fullscreen = false,
}) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    if (modeless) element.show();
    else element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, [modeless]);
  return (
    <dialog
      ref={dialog}
      className={`modal ${fullscreen ? "payment-success-screen" : ""} ${compact ? "compact" : ""} ${drawer ? "sale-details-drawer" : ""} ${modeless ? "modeless" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (closable) onClose();
      }}
    >
      <header className={fullscreen ? "sr-only" : "modal-header"}>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {closable && !fullscreen && (
          <button
            type="button"
            className="icon-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        )}
      </header>
      {children}
    </dialog>
  );
}
