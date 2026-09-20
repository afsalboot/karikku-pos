"use client";
import { useCallback, useId, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import PickerPanel from "./picker-panel";

export default function Select({ children, className = "", onChange, ...props }) {
  const id = useId();
  const [anchor, setAnchor] = useState(null), [options, setOptions] = useState([]), [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const close = useCallback(() => setAnchor(null), []);
  function open(element) {
    if (element.matches(":disabled")) return;
    setOptions(Array.from(element.options).map(o => ({ value: o.value, label: o.text, disabled: o.disabled || o.parentElement.disabled, selected: o.selected })));
    setActive(Math.max(0, element.selectedIndex)); setQuery(""); setAnchor(element);
  }
  const shown = options.filter(o => o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function choose(option) {
    if (!option || option.disabled || anchor.matches(":disabled")) return;
    if (Array.from(anchor.options).some(o => o.value === option.value && !o.disabled)) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(anchor, option.value);
      anchor.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(); anchor.focus();
  }
  function keys(e) {
    if (!anchor) {
      if (["ArrowDown", "ArrowUp", " ", "Enter"].includes(e.key)) { e.preventDefault(); open(e.currentTarget); }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      let next = e.key === "Home" ? 0 : e.key === "End" ? shown.length - 1 : active + (e.key === "ArrowDown" ? 1 : -1);
      const direction = e.key === "ArrowUp" || e.key === "End" ? -1 : 1;
      while (next >= 0 && next < shown.length && shown[next].disabled) next += direction;
      next = Math.max(0, Math.min(shown.length - 1, next)); setActive(next);
      document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" || (e.key === " " && e.target.tagName !== "INPUT")) { e.preventDefault(); choose(shown[active]); }
    else if (e.key === "Tab") close();
    else if (e.target.tagName === "SELECT" && e.key.length === 1) {
      e.preventDefault(); const index = options.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(e.key.toLowerCase())); if (index >= 0) setActive(index);
    }
  }
  return <span className={`picker-select ${className}`}>
    <select {...props} className={className} aria-expanded={Boolean(anchor)} aria-controls={anchor ? id : undefined} aria-activedescendant={anchor ? `${id}-${active}` : undefined} onChange={e => { onChange?.(e); close(); }} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); if (anchor) close(); else open(e.currentTarget); }} onMouseDown={e => e.preventDefault()} onClick={e => e.preventDefault()} onKeyDown={keys}>{children}</select>
    <ChevronDown size={14} className="picker-chevron" aria-hidden="true" />
    {anchor && <PickerPanel anchor={anchor} onClose={close} id={`${id}-panel`} className="select-panel" label="Choose an option">
      {options.length > 8 && <div className="picker-search"><Search size={15} aria-hidden="true"/><input aria-label="Search options" placeholder="Search options…" value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={keys}/></div>}
      <div role="listbox" id={id} aria-label={props["aria-label"] || "Options"} className="picker-options" onKeyDown={keys}>{shown.length ? shown.map((o, i) => <div key={`${o.value}-${i}`} id={`${id}-${i}`} role="option" aria-selected={o.selected} aria-disabled={Boolean(o.disabled)} className={`picker-option ${active === i ? "is-active" : ""}`} onPointerMove={() => setActive(i)} onPointerDown={e => e.preventDefault()} onClick={() => choose(o)}><span>{o.label}</span>{o.selected && <Check size={15} aria-hidden="true"/>}</div>) : <p className="picker-empty">No matching options</p>}</div>
    </PickerPanel>}
  </span>;
}
