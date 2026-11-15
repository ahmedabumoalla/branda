'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {Check, ChevronDown, LoaderCircle, Plus, X} from 'lucide-react';
import s from './creatable-select.module.css';

export type CreatableOption = {id: string; name: string};
type Props = {
  label: string;
  value: string;
  options: CreatableOption[];
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<CreatableOption>;
  canCreate: boolean;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  maxLength?: number;
};
const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function CreatableSelect({label, value, options, onChange, onCreate, canCreate, disabled = false, onPendingChange, maxLength = 120}: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const [created, setCreated] = useState<CreatableOption[]>([]);
  const choices = [...options, ...created.filter(option => !options.some(existing => existing.id === option.id))];
  const selected = choices.find(option => option.id === value);
  const [draft, setDraft] = useState({value, text: selected?.name ?? ''});
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  // An external reset or selection replaces the text; typing keeps its own blank ID.
  if (draft.value !== value) setDraft({value, text: selected?.name ?? ''});
  const text = draft.value === value ? draft.text : selected?.name ?? '';
  const search = value ? '' : normalized(text);
  const filtered = search ? choices.filter(option => normalized(option.name).includes(search)) : choices;
  const exact = choices.find(option => normalized(option.name) === normalized(text));
  const canAdd = canCreate && !!text.trim() && !exact && !value;
  const count = filtered.length + (canAdd ? 1 : 0);
  const needsSelection = !value && !!text.trim();
  const invalidMessage = pending ? 'انتظر حتى يكتمل الحفظ' : needsSelection ? canCreate ? 'اضغط Enter لاختيار القيمة أو إضافتها قبل حفظ الصنف' : 'اختر قيمة من القائمة أو امسح الحقل' : '';
  const expanded = open && !disabled;
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (expanded && active >= 0) list.current?.children[active]?.scrollIntoView({block: 'nearest'});
  }, [active, expanded]);

  function select(option: CreatableOption) {
    if (disabled || lock.current) return;
    setDraft({value: option.id, text: option.name});
    input.current?.setCustomValidity('');
    setError(''); setOpen(false); setActive(-1);
    onChange(option.id);
  }

  async function create() {
    if (disabled || lock.current || !canAdd) return;
    const name = text.trim();
    lock.current = true; setPending(true); setError('');
    input.current?.setCustomValidity('انتظر حتى يكتمل الحفظ');
    onPendingChange?.(true);
    try {
      const option = await onCreate(name);
      if (!alive.current) return;
      if (!option.id || !option.name) throw new Error('تعذر تأكيد الحفظ أعد المحاولة');
      setCreated(current => [...current.filter(row => row.id !== option.id), option]);
      setDraft({value: option.id, text: option.name});
      input.current?.setCustomValidity('');
      setOpen(false); setActive(-1);
      onChange(option.id);
    } catch (failure) {
      if (alive.current) {
        setError(failure instanceof Error ? failure.message : 'تعذر الحفظ أعد المحاولة');
        input.current?.setCustomValidity('لم تحفظ القيمة أعد المحاولة أو اختر قيمة موجودة');
      }
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
      onPendingChange?.(false);
    }
  }

  function commit() {
    if (active >= 0 && active < filtered.length) select(filtered[active]);
    else if (active === filtered.length && canAdd) void create();
    else if (exact) select(exact);
    else if (canAdd) void create();
    else if (needsSelection) { setError('اختر قيمة من القائمة أو امسح الحقل'); setOpen(true); }
    else setOpen(false);
  }

  return <div className={s.field} onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    if (!lock.current && !value && exact) select(exact);
    setOpen(false);
  }}>
    <label className={s.label} htmlFor={id}>{label}</label>
    <div className={s.control} data-invalid={!!error || undefined}>
      <input id={id} ref={node => { input.current = node; node?.setCustomValidity(error && needsSelection ? 'لم تحفظ القيمة أعد المحاولة أو اختر قيمة موجودة' : invalidMessage); }}
        className={s.input} value={text} disabled={disabled} readOnly={pending} maxLength={maxLength} autoComplete="off"
        role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`}
        aria-activedescendant={expanded && active >= 0 && active < count ? optionId(active) : undefined}
        aria-invalid={error ? true : undefined} aria-describedby={error || needsSelection || pending ? `${id}-message` : undefined}
        placeholder={canCreate ? 'ابحث أو اكتب قيمة جديدة' : 'ابحث واختر من القائمة'}
        onFocus={() => { setOpen(true); setActive(-1); }}
        onChange={event => {
          if (lock.current) return;
          const next = event.target.value;
          setDraft({value: '', text: next}); setError(''); setOpen(true); setActive(-1);
          event.target.setCustomValidity(next.trim() ? 'اختر القيمة أو أضفها قبل حفظ الصنف' : '');
          if (value) onChange('');
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); if (!pending && !event.nativeEvent.isComposing) commit(); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); if (pending) return; setOpen(true);
            setActive(current => count ? event.key === 'ArrowDown' ? (current + 1) % count : current <= 0 ? count - 1 : current - 1 : -1);
          } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
          else if (event.key === 'Tab') { if (!pending && !value && exact) select(exact); setOpen(false); }
        }}/>
      {pending ? <LoaderCircle className={`${s.indicator} ${s.spin}`} size={17} aria-hidden="true"/> : text ? <button className={s.clear} type="button" disabled={disabled} aria-label={`مسح ${label}`} onClick={() => {
        setDraft({value: '', text: ''}); onChange(''); setError(''); setActive(-1); input.current?.setCustomValidity(''); input.current?.focus(); setOpen(true);
      }}><X size={16} aria-hidden="true"/></button> : <ChevronDown className={s.indicator} size={17} aria-hidden="true"/>}
    </div>
    {expanded && <div id={`${id}-list`} ref={list} className={s.list} role="listbox" aria-label={label} aria-busy={pending}>
      {filtered.map((option, index) => <button id={optionId(index)} key={option.id} className={s.option} data-active={active === index || undefined} type="button" role="option" aria-selected={value === option.id} tabIndex={-1} disabled={pending}
        onPointerDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => select(option)}><span>{option.name}</span>{value === option.id && <Check size={16} aria-hidden="true"/>}</button>)}
      {canAdd && <button id={optionId(filtered.length)} className={`${s.option} ${s.create}`} data-active={active === filtered.length || undefined} type="button" role="option" aria-selected={false} tabIndex={-1} disabled={pending}
        onPointerDown={event => event.preventDefault()} onMouseMove={() => setActive(filtered.length)} onClick={() => void create()}><Plus size={17} aria-hidden="true"/><span>إضافة «{text.trim()}»</span><kbd>Enter</kbd></button>}
      {!count && <p className={s.empty}>{search ? 'لا توجد نتائج مطابقة' : canCreate ? 'اكتب الاسم ثم اضغط Enter لإضافته' : 'لا توجد خيارات متاحة'}</p>}
    </div>}
    {(error || needsSelection || pending) && <p id={`${id}-message`} className={error ? s.error : s.hint} role={error ? 'alert' : 'status'}>{error || (pending ? 'جارٍ الحفظ' : canCreate ? 'اضغط Enter لاختيار القيمة أو إضافتها' : 'اختر قيمة من القائمة')}</p>}
  </div>;
}
