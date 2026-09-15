import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Eye, Pencil, Copy, Power, CheckCircle2 } from "lucide-react";
export default function ProductActions({
  menu,
  onClose,
  onView,
  onEdit,
  onDuplicate,
  onToggle,
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
      if (event.key === "Tab") onClose();
      if (["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const buttons = [...ref.current.querySelectorAll("button")];
        const current = buttons.indexOf(document.activeElement);
        buttons[
          (current + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
            buttons.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);
  const p = menu.product;
  const actions = [
    ["View Product", Eye, () => onView(p)],
    ["Edit Product", Pencil, () => onEdit(p)],
    ["Duplicate Product", Copy, () => onDuplicate(p)],
    [
      p.available === false ? "Mark Available" : "Mark Sold Out",
      CheckCircle2,
      () => onToggle(p, "available"),
    ],
    [p.active ? "Deactivate" : "Activate", Power, () => onToggle(p, "active")],
  ];
  return createPortal(
    <div
      role="menu"
      aria-label="Product actions"
      className="sales-action-menu"
      ref={ref}
      style={{
        top: Math.max(
          8,
          Math.min(menu.rect.bottom + 5, window.innerHeight - 245),
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
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
