import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { UserRound, History } from "lucide-react";
export default function CustomerActions({ menu, onClose, onView }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const outside = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        menu.trigger.focus();
      }
      if (e.key === "Tab") onClose();
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        const buttons = [...ref.current.querySelectorAll("button")];
        buttons[
          (buttons.indexOf(document.activeElement) + 1) % buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);
  return createPortal(
    <div
      className="sales-action-menu"
      ref={ref}
      role="menu"
      aria-label="Customer actions"
      style={{
        top: Math.max(
          8,
          Math.min(menu.rect.bottom + 5, window.innerHeight - 115),
        ),
        left: Math.max(
          8,
          Math.min(menu.rect.right - 190, window.innerWidth - 198),
        ),
      }}
    >
      {[
        ["View Customer", UserRound, false],
        ["Purchase History", History, true],
      ].map(([label, Icon, full]) => (
        <button
          type="button"
          role="menuitem"
          key={label}
          onClick={() => {
            onClose();
            onView(menu.customer._id, full);
          }}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
