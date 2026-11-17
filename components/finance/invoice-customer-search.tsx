"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { searchAldeemInvoiceCustomers } from "@/app/actions/aldeem-invoice-lookups";
import type { FinanceParty } from "@/lib/finance/brand-finance";
import css from "./invoice-product-dropdown.module.css";

export function InvoiceCustomerSearch({ customer, disabled, onSelect }: { customer?: FinanceParty; disabled: boolean; onSelect: (party: FinanceParty) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, { at: number; rows: FinanceParty[] }>());
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [request, setRequest] = useState<{ query: string; sequence: number } | null>(null);
  const [rows, setRows] = useState<FinanceParty[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360, maxHeight: 370 });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (party: FinanceParty) => { if (!disabled) { onSelect(party); close(); } };
  const search = () => { setRows([]); setActive(-1); setError(""); setBusy(true); setRequest(previous => ({ query: query.trim(), sequence: (previous?.sequence ?? 0) + 1 })); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(Math.max(anchor.width, 360), window.innerWidth - 24);
      const below = window.innerHeight - anchor.bottom - 16, above = anchor.top - 16;
      const upwards = below < 220 && above > below;
      const maxHeight = Math.max(120, Math.min(370, upwards ? above : below));
      setPosition({ width, maxHeight, left: Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12)), top: upwards ? Math.max(12, anchor.top - maxHeight - 6) : anchor.bottom + 6 });
    };
    place(); input.current?.focus();
    const outside = (event: Event) => { if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); };
  }, [open]);
  useEffect(() => {
    if (!open || !request) return;
    let current = true;
    const cached = cache.current.get(request.query);
    if (cached && Date.now() - cached.at < 30000) { setRows(cached.rows); setActive(-1); setBusy(false); return; }
    void searchAldeemInvoiceCustomers(request.query).then(result => {
      if (!current) return;
      if (result.ok) { if (cache.current.size >= 20) cache.current.clear(); cache.current.set(request.query, { at: Date.now(), rows: result.data }); setRows(result.data); setActive(-1); } else setError(result.message);
    }).catch(() => { if (current) setError("تعذر البحث عن العميل"); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [open, request]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, open, id]);
  return <>
    <button ref={trigger} type="button" className={`${css.trigger} ${css.customerTrigger}`} disabled={disabled} aria-label="اختيار العميل" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) setOpen(false); else { setRequest(previous => ({ query: "", sequence: (previous?.sequence ?? 0) + 1 })); setRows([]); setQuery(""); setError(""); setBusy(true); setActive(-1); setOpen(true); } }}>
      <span>{customer?.name || "اختر العميل"}</span><ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={panel} className={css.panel} dir="rtl" style={position} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className={css.search}><input ref={input} role="combobox" aria-label="اسم العميل" aria-expanded="true" aria-controls={id} aria-autocomplete="list" aria-activedescendant={active >= 0 && rows[active] ? `${id}-${active}` : undefined}
        value={query} maxLength={100} placeholder="اسم العميل أو رقمه أو جواله أو باركوده" onChange={event => { setQuery(event.target.value); setRequest(null); setRows([]); setBusy(false); setError(""); setActive(-1); }}
        onKeyDown={event => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(previous => rows.length ? previous < 0 ? (event.key === "ArrowDown" ? 0 : rows.length - 1) : (previous + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length : -1); }
          if (event.key === "Enter") { event.preventDefault(); if (rows[active]) choose(rows[active]); else search(); }
        }} /><button type="button" className={css.searchButton} disabled={busy} onClick={search}><Search size={15} aria-hidden="true" />بحث</button></div>
      <div id={id} role="listbox" aria-label="نتائج بحث العملاء" aria-busy={busy} className={css.results}>
        {rows.map((party, index) => <button type="button" role="option" id={`${id}-${index}`} key={party.id} aria-selected={customer?.id === party.id} tabIndex={-1} className={css.option} data-active={active === index} onClick={() => choose(party)}>
          <span className={css.identity}><strong>{party.name}</strong>{party.details?.customerCode && <small>رقم العميل {party.details.customerCode}</small>}{party.phone && <small dir="ltr">{party.phone}</small>}</span>
        </button>)}
      </div>
      {busy && <p className={css.status} role="status">جار البحث عن العملاء</p>}
      {error && <div className={css.status} role="alert">{error}<button type="button" onClick={search}>إعادة المحاولة</button></div>}
      {!busy && !error && !rows.length && <p className={css.status} role="status">{request ? "لا توجد نتائج مطابقة" : "اكتب اسم العميل ثم اضغط بحث"}</p>}
      {!busy && rows.length === 20 && <p className={css.status}>اكتب اسمًا أدق لتضييق النتائج</p>}
    </div>, document.body)}
  </>;
}
