"use client";
import { useFinancePosLocale } from "./finance-pos-locale";


import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import styles from "./finance-touch-number-input.module.css";

export type FinanceTouchNumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "inputMode"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** String editing deliberately leaves monetary/quantity bounds to the owning form. */
export function editFinanceTouchNumber(value: string, key: string, start = value.length, end = start) {
  const left = Math.max(0, Math.min(start, value.length)), right = Math.max(left, Math.min(end, value.length));
  if (key === "clear") return { value: "", caret: 0 };
  if (key === "backspace") {
    const from = left === right ? Math.max(0, left - 1) : left;
    return { value: value.slice(0, from) + value.slice(right), caret: from };
  }
  if (!/^[0-9.]$/.test(key) || (key === "." && (value.slice(0, left) + value.slice(right)).includes("."))) return { value, caret: left };
  const insertion = key === "." && left === 0 ? "0." : key;
  return { value: value.slice(0, left) + insertion + value.slice(right), caret: left + insertion.length };
}

export function FinanceTouchNumberInput({ value, onValueChange, disabled, readOnly, onFocus, onClick, onKeyDown, ...attributes }: FinanceTouchNumberInputProps) {
  const { t, dir, language } = useFinancePosLocale();
  const input = useRef<HTMLInputElement>(null), panel = useRef<HTMLDivElement>(null), caret = useRef<number | null>(null), restoringFocus = useRef(false);
  const [placement, setPlacement] = useState<{ host: Element; left: number; top: number; width: number } | null>(null);
  const panelId = useId();
  const label = attributes["aria-label"] || t("إدخال الرقم");
  const open = Boolean(placement && !disabled && !readOnly);
  function show() {
    if (disabled || readOnly || !input.current) return;
    const rect = input.current.getBoundingClientRect(), viewport = window.visualViewport;
    const width = Math.min(288, (viewport?.width ?? window.innerWidth) - 16), height = Math.min(344, (viewport?.height ?? window.innerHeight) - 16);
    const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0, bottom = y + (viewport?.height ?? window.innerHeight);
    const left = Math.max(x + 8, Math.min(rect.left, x + (viewport?.width ?? window.innerWidth) - width - 8));
    const top = Math.max(y + 8, Math.min(rect.bottom + 8 + height <= bottom ? rect.bottom + 8 : rect.top - height - 8, bottom - height - 8));
    const host = input.current.closest('[role="dialog"]') || document.fullscreenElement || document.body;
    setPlacement({ host, left, top, width });
  }
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => { const target = event.target; if (target instanceof Node && target !== input.current && !panel.current?.contains(target)) setPlacement(null); };
    const dismiss = () => setPlacement(null);
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    window.addEventListener("resize", dismiss);
    window.visualViewport?.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
      window.removeEventListener("resize", dismiss);
      window.visualViewport?.removeEventListener("resize", dismiss);
    };
  }, [open]);
  useEffect(() => {
    if (caret.current === null || !input.current || document.activeElement !== input.current) return;
    input.current.setSelectionRange(caret.current, caret.current); caret.current = null;
  }, [value]);
  function press(key: string) {
    if (disabled || readOnly) return;
    const next = editFinanceTouchNumber(value, key, input.current?.selectionStart ?? value.length, input.current?.selectionEnd ?? value.length);
    if (attributes.maxLength !== undefined && next.value.length > attributes.maxLength) return;
    if (next.value === value) return;
    caret.current = next.caret; onValueChange(next.value);
  }
  function finish() {
    if (input.current && document.activeElement !== input.current) {
      restoringFocus.current = true; input.current.focus({ preventScroll: true });
    }
    setPlacement(null);
  }
  function dismissKey(event: React.KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); event.stopPropagation(); finish(); }
  }
  return <>
    <input {...attributes} ref={input} type="text" inputMode="none" dir="ltr" value={value} disabled={disabled} readOnly={readOnly}
      aria-controls={open ? panelId : undefined} aria-haspopup="dialog"
      onChange={event => { caret.current = null; onValueChange(event.target.value); }}
      onFocus={event => { onFocus?.(event); if (restoringFocus.current) restoringFocus.current = false; else if (!event.defaultPrevented) show(); }}
      onClick={event => { onClick?.(event); if (!event.defaultPrevented) show(); }}
      onKeyDown={event => { if (open && (event.key === "Escape" || event.key === "Enter")) dismissKey(event); else onKeyDown?.(event); }} />
    {open && placement && createPortal(<div ref={panel} id={panelId} role="dialog" aria-label={`${t("لوحة أرقام ")}${label}`} dir={dir} lang={language} className={styles.panel}
      style={{ left: placement.left, top: placement.top, width: placement.width }} onKeyDown={event => { if (event.key === "Escape") dismissKey(event); }}>
      <div className={styles.heading}><span>{label}</span><output dir="ltr" aria-label={t("القيمة الحالية")} aria-live="polite">{value || "—"}</output></div>
      <div className={styles.keys} dir="ltr">
        {["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "backspace"].map(key => <button key={key} type="button" className={styles.key}
          aria-label={key === "backspace" ? t("حذف الرقم السابق") : key === "." ? t("الفاصلة العشرية") : key}
          onPointerDown={event => event.preventDefault()} onClick={() => press(key)}>{key === "backspace" ? "⌫" : key}</button>)}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.done} onPointerDown={event => event.preventDefault()} onClick={finish}>{t("تم")}</button>
        <button type="button" className={styles.key} onPointerDown={event => event.preventDefault()} onClick={() => press("clear")}>{t("مسح الكل")}</button>
      </div>
    </div>, placement.host)}
  </>;
}
