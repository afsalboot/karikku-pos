"use client";
import { useCallback, useId, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import PickerPanel from "./picker-panel";
const iso = date => `${String(date.getFullYear()).padStart(4,"0")}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? new Date(`${value}T12:00:00`) : new Date();
export default function DateInput({ className = "", rangeStart, rangeEnd, onChange, ...props }) {
  const id = useId(), [anchor, setAnchor] = useState(null), [month, setMonth] = useState(() => new Date()), [focusDay, setFocusDay] = useState("");
  const close = useCallback(() => setAnchor(null), []);
  function open(input, keyboard = false) {
    if (input.matches(":disabled") || input.readOnly) return;
    const selected = input.value || rangeStart || iso(new Date());
    const bounded = props.min && selected < props.min ? props.min : props.max && selected > props.max ? props.max : selected;
    setMonth(parse(bounded)); setFocusDay(bounded); setAnchor(input);
    if (keyboard) requestAnimationFrame(() => document.getElementById(`${id}-${bounded}`)?.focus());
  }
  function select(value) {
    if (anchor.matches(":disabled")) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(anchor, value);
    anchor.dispatchEvent(new Event("input", { bubbles: true }));
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
    close(); anchor.focus();
  }
  const year = month.getFullYear(), index = month.getMonth();
  const first = new Date(year, index, 1, 12), offset = (first.getDay() + 6) % 7;
  const length = new Date(year, index + 1, 0).getDate();
  const days = Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => new Date(year, index, i - offset + 1, 12));
  const allowed = value => (!props.min || value >= props.min) && (!props.max || value <= props.max);
  function moveMonth(delta) { setMonth(new Date(year, index + delta, 1, 12)); }
  function dayKeys(e, date) {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined && !["Home", "End", "PageUp", "PageDown"].includes(e.key)) return;
    e.preventDefault();
    const next = new Date(date);
    if (delta !== undefined) next.setDate(next.getDate() + delta);
    else if (e.key === "Home") next.setDate(next.getDate() - (next.getDay() + 6) % 7);
    else if (e.key === "End") next.setDate(next.getDate() + 6 - (next.getDay() + 6) % 7);
    else { next.setDate(1); next.setMonth(next.getMonth() + (e.key === "PageUp" ? -1 : 1)); }
    const value = iso(next); if (!allowed(value)) return;
    setFocusDay(value); setMonth(next);
    requestAnimationFrame(() => document.getElementById(`${id}-${value}`)?.focus());
  }
  const today = iso(new Date());
  return <span className={`picker-date ${className}`}>
    <input {...props} className={className} type="date" aria-haspopup="dialog" aria-controls={anchor ? id : undefined} onChange={onChange} onClick={e => { e.preventDefault(); if (!anchor) open(e.currentTarget); }} onKeyDown={e => { if (["Enter", " "].includes(e.key) || (e.altKey && e.key === "ArrowDown")) { e.preventDefault(); open(e.currentTarget, true); } }} />
    <CalendarDays size={16} className="picker-calendar-icon" aria-hidden="true"/>
    {anchor && <PickerPanel anchor={anchor} onClose={close} className="calendar-panel" id={id} role="dialog" label="Choose date">
      <div className="calendar-value">{rangeStart || rangeEnd ? <><span className={rangeStart === anchor.value ? "selected" : ""}>{rangeStart || "Start date"}</span><span className={rangeEnd === anchor.value ? "selected" : ""}>{rangeEnd || "End date"}</span></> : <span className="selected">{anchor.value || "Choose a date"}</span>}</div>
      <header className="calendar-heading"><button type="button" aria-label="Previous month" disabled={props.min && iso(new Date(year,index,0,12)) < props.min} onClick={() => moveMonth(-1)}><ChevronLeft size={16}/></button><div><select aria-label="Calendar month" value={index} onChange={e => setMonth(new Date(year,Number(e.target.value),1,12))}>{Array.from({length:12},(_,i)=><option key={i} value={i}>{new Date(2024,i,1).toLocaleDateString("en-IN",{month:"long"})}</option>)}</select><input aria-label="Calendar year" type="number" min={props.min ? Number(props.min.slice(0,4)) : 1900} max={props.max ? Number(props.max.slice(0,4)) : 2100} value={year} onChange={e=>{const value=Number(e.target.value);if(value>=1900&&value<=2100)setMonth(new Date(value,index,1,12));}}/></div><button type="button" aria-label="Next month" disabled={props.max && iso(new Date(year,index+1,1,12)) > props.max} onClick={() => moveMonth(1)}><ChevronRight size={16}/></button></header>
      <div className="calendar-weekdays" aria-hidden="true">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><span key={d}>{d}</span>)}</div>
      <div className="calendar-grid" role="group" aria-label={month.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}>{days.map(date=>{const value=iso(date), selected=value===anchor.value, inRange=rangeStart&&rangeEnd&&value>=rangeStart&&value<=rangeEnd, endpoint=inRange&&(value===rangeStart||value===rangeEnd);return <button type="button" id={`${id}-${value}`} key={value} disabled={!allowed(value)} tabIndex={value===focusDay?0:-1} aria-label={date.toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})} aria-pressed={selected} aria-current={value===today?"date":undefined} className={`${date.getMonth()!==index?"outside-month":""} ${inRange?"in-range":""} ${selected||endpoint?"selected":""}`} onKeyDown={e=>dayKeys(e,date)} onClick={()=>select(value)}>{date.getDate()}</button>;})}</div>
      <footer className="calendar-footer"><button type="button" disabled={props.required} onClick={()=>select("")}>Clear</button><button type="button" disabled={!allowed(today)} onClick={()=>select(today)}>Today</button></footer>
    </PickerPanel>}
  </span>;
}
