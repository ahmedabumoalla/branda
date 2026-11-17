"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search, Plus } from "lucide-react";
import type { InvoiceCatalogProduct } from "@/lib/finance/inventory-sales";
import css from "./invoice-product-dropdown.module.css";

type Props = {
  label: string;
  value?: InvoiceCatalogProduct;
  fallback?: string;
  products: InvoiceCatalogProduct[];
  disabled: boolean;
  search: (query: string) => Promise<string[]>;
  onSelect: (product: InvoiceCatalogProduct) => void;
  onFreeItem?: () => void;
  price: (value: number) => string;
};

/** Search opens only on interaction and stays outside the invoice table layout. */
export function InvoiceProductDropdown({ label, value, fallback, products, disabled, search, onSelect, onFreeItem, price }: Props) {
  const id = useId();
  const trigger = useRef<HTMLInputElement>(null), panel = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const pendingScan = useRef<string | null>(null);
  const cache = useRef(new Map<string, { at: number; ids: string[] }>());
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [ids, setIds] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0), [active, setActive] = useState(-1);
  const rows = ids.flatMap(key => { const product = products.find(row => row.id === key && row.available); return product ? [product] : []; });
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus(); };
  const choose = (product: InvoiceCatalogProduct) => { if (disabled) return; onSelect(product); close(true); };

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = panel.current;
    dialog?.showModal();
    input.current?.focus();
    return () => dialog?.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setIds([]); setError(""); setActive(-1);
    const key = query.trim(), cached = cache.current.get(key);
    if (cached && Date.now() - cached.at < 30000) { setIds(cached.ids); setActive(cached.ids.length ? 0 : -1); setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => {
      void search(key).then(result => { if (current) { if (cache.current.size >= 20) cache.current.clear(); cache.current.set(key, { at: Date.now(), ids: result }); setIds(result); setActive(result.length ? 0 : -1); } })
        .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : "تعذر البحث عن الأصناف"); })
        .finally(() => { if (current) setBusy(false); });
    }, query.trim() && !pendingScan.current ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [open, query, search, attempt]);

  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, id, open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open || busy || disabled || pendingScan.current !== query.trim()) return;
    const exact = rows.filter(product => [product.barcode, product.sku, product.id].includes(query.trim()));
    if (exact.length === 1) { pendingScan.current = null; onSelect(exact[0]); setOpen(false); trigger.current?.focus(); }
  }, [open, busy, disabled, query, rows, onSelect]);

  return <>
    <input ref={trigger} className={css.itemInput} disabled={disabled} aria-label={`الصنف للبند ${label}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined}
      autoComplete="off" value={value?.name || fallback || ""}
      onClick={() => { pendingScan.current = null; setQuery(""); setIds([]); setOpen(true); }}
      onChange={event => { pendingScan.current = null; setQuery(event.target.value); setIds([]); setOpen(true); }}
      onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "Enter") { event.preventDefault(); pendingScan.current = null; setQuery(""); setOpen(true); } }} />
    {open && createPortal(<dialog ref={panel} id={`${id}-dialog`} className={css.productDialog} dir="rtl" aria-labelledby={`${id}-title`}
      onCancel={event => { event.preventDefault(); close(true); }}
      onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(true); } }}>
      <header className={css.dialogHeader}><h2 id={`${id}-title`}>اختيار الصنف</h2><button type="button" aria-label="إغلاق" onClick={() => close(true)}><X size={19} aria-hidden="true" /></button></header>
      <div className={css.search}><Search size={17} aria-hidden="true" /><input ref={input} role="combobox" aria-label="البحث عن المنتجات" aria-expanded="true" aria-controls={id} aria-autocomplete="list" aria-activedescendant={active >= 0 && rows[active] ? `${id}-${active}` : undefined}
        placeholder="ابحث عن صنف" maxLength={100} value={query} onChange={event => { pendingScan.current = null; setIds([]); setActive(-1); setQuery(event.target.value); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(previous => rows.length ? previous < 0 ? (event.key === "ArrowDown" ? 0 : rows.length - 1) : (previous + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length : -1); }
          if (event.key === "Enter") { event.preventDefault(); if (!busy && rows[active]) choose(rows[active]); else { pendingScan.current = query.trim(); setAttempt(value => value + 1); } }
        }} /></div>
      <div id={id} role="listbox" aria-label="نتائج بحث الأصناف" aria-busy={busy} className={css.results}>
        {rows.map((product, index) => <button type="button" role="option" aria-selected={value?.id === product.id} id={`${id}-${index}`} key={product.id} tabIndex={-1}
          className={css.option} data-active={active === index} onPointerMove={() => setActive(index)} onClick={() => choose(product)}>
          <span className={css.identity}><strong>{product.name}</strong>{(product.sku || product.barcode) && <small dir="ltr">{product.sku || product.barcode}</small>}</span>
          <span className={css.price}>{price(product.price)}{product.unitName && <small>لكل {product.unitName}</small>}</span>
        </button>)}
      </div>
      {busy && <p className={css.status} role="status">جار البحث</p>}
      {!busy && !error && !rows.length && <p className={css.status} role="status">{query.trim() ? "لا توجد أصناف مطابقة" : "لا توجد أصناف متاحة"}</p>}
      {!busy && rows.length >= 20 && <p className={css.status}>ابحث للوصول إلى الصنف المطلوب</p>}
      {error && <div className={css.status} role="alert">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div>}
      {onFreeItem && <button type="button" className={css.footer} onClick={() => { close(); onFreeItem(); }}><Plus size={15} aria-hidden="true" />إضافة بند حر لهذه الفاتورة</button>}
    </dialog>, document.body)}
  </>;
}
