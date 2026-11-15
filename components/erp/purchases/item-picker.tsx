'use client';
import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Package } from 'lucide-react';
import type { FinanceItem } from '@/lib/finance/brand-finance';
import s from './item-picker.module.css';

/** Scanner keyboards terminate with Enter; never let that submit the invoice. */
export function PurchaseItemPicker({ items, value, onSelect, inputRef }: { items: FinanceItem[]; value: string; onSelect: (id: string) => void; inputRef?: Ref<HTMLInputElement> }) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const selected = items.find(item => item.id === value);
  const label = (item: FinanceItem) => `${item.name} — ${item.sku}`;
  const needle = (query ?? '').trim().toLocaleLowerCase();
  const suggestions = items.filter(item => !needle || `${item.name} ${item.sku} ${item.barcode ?? ''}`.toLocaleLowerCase().includes(needle)).slice(0, 80);
  const open = position !== null;
  function show() {
    const rect = field.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 4, left: Math.max(8, rect.left), width: Math.min(rect.width, window.innerWidth - 16), maxHeight: Math.max(0, Math.min(280, window.innerHeight - rect.bottom - 12)) });
  }
  function choose(item: FinanceItem) {
    setPosition(null); setActive(-1); setQuery(null); setMessage('');
    onSelect(item.id);
  }
  useEffect(() => {
    if (!open) return;
    // Close on ancestor scrolling so the list cannot become detached from its field.
    const close = (event: Event) => {
      if (event.target instanceof Node && list.current?.contains(event.target)) return;
      setPosition(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);
  useEffect(() => {
    const option = list.current?.children[active] as HTMLElement | undefined;
    const container = list.current;
    if (!option || !container) return;
    if (option.offsetTop < container.scrollTop) container.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > container.scrollTop + container.clientHeight) container.scrollTop = option.offsetTop + option.offsetHeight - container.clientHeight;
  }, [active]);
  return <div className={s.field}>
    <input ref={node => { field.current = node; if (typeof inputRef === 'function') inputRef(node); else if (inputRef) inputRef.current = node; }}
      role="combobox" aria-expanded={open} aria-controls={open ? id : undefined} aria-autocomplete="list"
      aria-activedescendant={open && active >= 0 && suggestions[active] ? `${id}-${suggestions[active].id}` : undefined}
      aria-label="اختيار الصنف بالاسم أو الباركود" aria-describedby={message ? `${id}-error` : undefined}
      autoComplete="off" placeholder="اختر الصنف أو امسح الباركود" value={query ?? (selected ? label(selected) : '')}
      onFocus={event => { event.currentTarget.select(); setActive(-1); show(); }} onClick={show}
      onChange={event => { setQuery(event.target.value); setActive(-1); setMessage(''); show(); }}
      onBlur={() => { setPosition(null); setQuery(null); setActive(-1); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); setPosition(null); } return; }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); show();
          setActive(current => suggestions.length ? event.key === 'ArrowDown' ? Math.min(current + 1, suggestions.length - 1) : current < 0 ? suggestions.length - 1 : Math.max(0, current - 1) : -1);
        }
        if (event.key !== 'Enter') return;
        event.preventDefault(); event.stopPropagation();
        if (open && active >= 0 && suggestions[active]) { choose(suggestions[active]); return; }
        const text = event.currentTarget.value.trim();
        const matches = items.filter(item => label(item) === text || item.barcode === text || item.sku === text || item.name === text);
        if (matches.length === 1) choose(matches[0]);
        else { show(); setMessage(matches.length > 1 ? 'اختر الصنف المطلوب من النتائج المتشابهة' : 'لم يوجد صنف مطابق للاسم أو الباركود'); }
      }} />
    <ChevronDown className={s.chevron} size={14} aria-hidden="true" />
    {message && <small className={s.error} id={`${id}-error`} role="status">{message}</small>}
    {position && createPortal(<div ref={list} id={id} className={s.list} style={position} role="listbox" aria-label="الأصناف" dir="rtl">
      {suggestions.map((item, index) => <div key={item.id} id={`${id}-${item.id}`} role="option" aria-selected={item.id === value}
        className={s.option} data-active={index === active} onPointerDown={event => event.preventDefault()} onClick={() => choose(item)}>
        <Package size={18} aria-hidden="true" /><div><strong>{item.name}</strong><span><bdi>{item.sku}</bdi>{item.barcode && <bdi>{item.barcode}</bdi>}</span></div>
      </div>)}
      {!suggestions.length && <div className={s.empty}>لا توجد أصناف مطابقة</div>}
    </div>, document.body)}
  </div>;
}
