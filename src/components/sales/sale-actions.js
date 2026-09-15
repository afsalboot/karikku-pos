import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Eye, Printer, Copy, Undo2, Ban } from "lucide-react";

export default function SaleActions({
  menu,
  onClose,
  onView,
  onPrint,
  onDuplicate,
  admin,
}) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const close = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    const keydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        menu.trigger.focus();
      }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const buttons = [...ref.current.querySelectorAll("button")];
        const i = buttons.indexOf(document.activeElement);
        buttons[
          (i + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
            buttons.length
        ]?.focus();
      }
      if (event.key === "Tab") onClose();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
    };
  }, [menu, onClose]);
  const actions = [
    ["View Sale", Eye, () => onView(menu.sale)],
    ["Reprint Receipt", Printer, () => onPrint(menu.sale)],
    ["Print Invoice", Printer, () => onPrint(menu.sale)],
    ["Duplicate Sale", Copy, () => onDuplicate(menu.sale)],
  ];
  if (admin && menu.sale.status === "COMPLETED")
    actions.push(
      ["Cancel / Void Sale", Ban, () => onView(menu.sale, "CANCELLED")],
      ["Refund", Undo2, () => onView(menu.sale, "REFUNDED")],
    );
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Sale actions"
      className="sales-action-menu"
      style={{
        top: Math.max(
          8,
          Math.min(menu.rect.bottom + 5, window.innerHeight - 290),
        ),
        left: Math.max(
          8,
          Math.min(menu.rect.right - 190, window.innerWidth - 198),
        ),
      }}
    >
      {actions.map(([label, Icon, action]) => (
        <button
          type="button"
          role="menuitem"
          key={label}
          onClick={() => {
            onClose();
            action();
          }}
        >
          <Icon size={15} />
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
