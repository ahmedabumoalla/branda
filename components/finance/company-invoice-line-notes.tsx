"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";
import css from "./company-invoice-line-notes.module.css";
const noteKey = (text: string) => text.trim().toLocaleLowerCase();

export type InvoiceLineNoteControls = {
  enabled: boolean;
  options: { id: string; text: string }[];
  values: Record<number, string[]>;
  onChange: (key: number, notes: string[]) => void;
  onSaveCustom?: (notes: string[]) => Promise<{ ok: boolean; message?: string }>;
};

export function CompanyInvoiceLineNotes({ rowKey, index, controls, disabled }: { rowKey: number; index: number; controls: InvoiceLineNoteControls; disabled: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const picker = useRef<HTMLDivElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  function showOptions() {
    const box = picker.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom - 8, above = box.top - 8;
    const flip = below < 160 && above > below;
    const height = Math.max(60, Math.min(240, flip ? above : below));
    setAnchor({ left: box.left + 10, top: flip ? box.top - height : box.bottom, width: box.width - 20, maxHeight: height });
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (!(event.target instanceof Node) || !dropdown.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("scroll", close, true); window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [open]);
  const notes = controls.values[rowKey] ?? [];
  const blocked = disabled || !controls.enabled || saving;
  const value = query.trim();
  const options = controls.options.filter(note => !notes.some(text => noteKey(text) === noteKey(note.text)) && note.text.toLocaleLowerCase("ar").includes(value.toLocaleLowerCase("ar"))).slice(0, 25);
  const isCustom = !!value && !notes.some(text => noteKey(text) === noteKey(value)) && !options.some(note => noteKey(note.text) === noteKey(value));
  const choices = [...options.map(note => note.text), ...(isCustom ? [value] : [])];
  function add(text: string) {
    if (blocked || notes.length >= 10 || !text.trim() || text.trim().length > 50) return;
    const savedText = controls.options.find(note => noteKey(note.text) === noteKey(text))?.text ?? text.trim();
    if (!notes.some(note => noteKey(note) === noteKey(savedText))) controls.onChange(rowKey, [...notes, savedText]);
    setQuery(""); setActive(-1); setOpen(false); setMessage("");
  }
  const custom = notes.filter(note => !controls.options.some(option => noteKey(option.text) === noteKey(note)));
  return <div className={css.row}>
    <div ref={picker} className={css.picker} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <div className={css.chips}>
        {notes.map(note => <span className={css.chip} key={note}>{note}<button type="button" disabled={blocked} aria-label={`إزالة ملاحظة ${note}`} onClick={() => { controls.onChange(rowKey, notes.filter(item => item !== note)); setOpen(false); }}><X size={13} aria-hidden="true" /></button></span>)}
        {controls.enabled && <input value={query} maxLength={50} disabled={blocked || notes.length >= 10} aria-label={`ملاحظات البند ${index + 1}`} placeholder="اختر ملاحظة" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && active >= 0 && active < choices.length ? `${id}-${active}` : undefined} onFocus={showOptions} onChange={event => { setQuery(event.target.value); setActive(-1); showOptions(); }} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); showOptions(); setActive(previous => choices.length ? (previous + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length : -1); }
          else if (event.key === "Enter") { event.preventDefault(); if (active >= 0 && choices[active]) add(choices[active]); else if (value) add(value); }
        }} />}
        {!controls.enabled && !notes.length && <span>لا توجد ملاحظات</span>}
      </div>
      {open && anchor && !blocked && notes.length < 10 && createPortal(<div ref={dropdown} dir="rtl" style={anchor} className={css.options} id={`${id}-list`} role="listbox" aria-label="ملاحظات البنود المتاحة">
        {choices.map((text, optionIndex) => <button type="button" role="option" aria-selected={active === optionIndex} id={`${id}-${optionIndex}`} key={text} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => add(text)}>{isCustom && optionIndex === choices.length - 1 ? `إضافة ملاحظة مخصصة: ${text}` : text}</button>)}
        {!choices.length && <p>اكتب ملاحظة مخصصة حتى ٥٠ حرفًا</p>}
      </div>, document.body)}
      {notes.length >= 10 && <small>الحد الأقصى ١٠ ملاحظات لكل بند</small>}
      {!controls.enabled && notes.length > 0 && <small>الملاحظات المحفوظة محفوظة للفاتورة ومكتبة الملاحظات معطلة حاليًا</small>}
      {message && <p role="status">{message}</p>}
    </div>
    {controls.enabled && controls.onSaveCustom && <button type="button" className={css.save} aria-label={`حفظ الملاحظات المخصصة للبند ${index + 1} في المكتبة`} title="حفظ الملاحظات المخصصة" disabled={blocked || !custom.length} onClick={async () => {
      if (lock.current || !controls.onSaveCustom) return;
      lock.current = true; setSaving(true); setMessage("");
      try { const result = await controls.onSaveCustom(custom); setMessage(result.ok ? "تم حفظ الملاحظات في المكتبة" : result.message || "تعذر حفظ الملاحظات في المكتبة"); }
      catch { setMessage("تعذر تأكيد حفظ الملاحظات أعد المحاولة"); }
      finally { lock.current = false; setSaving(false); }
    }}><Save size={18} aria-hidden="true" /></button>}
  </div>;
}
