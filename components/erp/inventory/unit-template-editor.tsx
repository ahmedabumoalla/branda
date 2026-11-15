'use client';

import {useId, useRef, useState, type ReactNode} from 'react';
import {ArrowDown, Box, Boxes, Check, Layers3, LoaderCircle, Plus, Save, Trash2} from 'lucide-react';
import type {InventoryCatalog} from '@/lib/erp/inventory';
import {compileUnitTemplate, unitTemplateDraft, unitTemplateFactors, type UnitTemplateRow} from '@/lib/erp/unit-templates';
import s from './unit-template-editor.module.css';

export type UnitTemplateSavePayload = {name: string; payload: Record<string, unknown>};
export function UnitTemplateEditor({units, initialTemplate, busy = false, disabled: unavailable = false, error = '', onSave, onCancel, detailsSlot}: {
  units: {id: string; name: string}[];
  initialTemplate?: InventoryCatalog;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  onSave: (value: UnitTemplateSavePayload) => Promise<boolean>;
  onCancel?: () => void;
  detailsSlot?: ReactNode;
}) {
  const [name, setName] = useState(initialTemplate?.name ?? '');
  const [draft, setDraft] = useState(() => unitTemplateDraft(initialTemplate));
  const [localError, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false), sequence = useRef(draft.rows.length), id = useId();
  const pending = busy || saving;
  const disabled = pending || unavailable;
  const factors = unitTemplateFactors(draft);
  const baseChoices = units.some(unit => unit.name === draft.baseName) || !draft.baseName ? units : [...units, {id: 'legacy-base', name: draft.baseName}];
  const format = (value: number) => value.toLocaleString('ar-SA', {maximumFractionDigits: 6});
  const change = (rowId: string, patch: Partial<UnitTemplateRow>) => setDraft(current => ({...current, rows: current.rows.map(row => row.id === rowId ? {...row, ...patch} : row)}));
  function remove(rowId: string) {
    setDraft(current => ({...current, rows: current.rows.filter(row => row.id !== rowId).map(row => row.parentId === rowId ? {...row, parentId: 'base', count: factors.has(row.id) ? String(factors.get(row.id)) : ''} : row)}));
  }

  return <form className={s.editor} dir="rtl" aria-busy={pending} onSubmit={async event => {
    event.preventDefault(); if (lock.current || disabled) return;
    try {
      if (!name.trim()) throw new Error('اكتب اسم القالب');
      if (name.trim().length > 150) throw new Error('اسم القالب يجب ألا يتجاوز ١٥٠ حرفًا');
      if (!baseChoices.some(unit => unit.name === draft.baseName)) throw new Error('اختر وحدة أساسية من القائمة');
      const compiled = compileUnitTemplate(draft);
      setError(''); lock.current = true; setSaving(true);
      await onSave({name: name.trim(), payload: {...initialTemplate?.payload, ...compiled}});
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'تعذر حفظ القالب أعد المحاولة'); }
    finally { lock.current = false; setSaving(false); }
  }}>
    <div className={s.intro}><span className={s.introIcon}><Layers3 size={22} aria-hidden="true"/></span><div><h2>{initialTemplate ? 'تعديل قالب الوحدات' : 'قالب وحدات جديد'}</h2><p>ابدأ بأصغر وحدة ثم حدّد ما تحتويه كل عبوة أكبر</p></div><span className={s.count} dir="ltr">{draft.rows.length + 1} / 30</span></div>
    {(localError || error) && <p className={s.error} role="alert">{localError || error}</p>}
    <fieldset className={s.controls} disabled={disabled}>
      <legend className={s.srOnly}>بيانات قالب الوحدات</legend>
      <label className={s.field}><span>اسم القالب <b>*</b></span><input required maxLength={150} value={name} onChange={event => setName(event.target.value)} placeholder="مثل عبوات المشروبات أو تغليف المنتجات"/></label>
      <section className={s.base}>
        <div className={s.baseHeader}><span className={s.baseIcon}><Box size={21} aria-hidden="true"/></span><div><h3>الوحدة الأساسية</h3><p>الوحدة التي تُحسب عليها كميات المخزون</p></div><span className={s.baseBadge}>الأساس</span></div>
        <label className={s.field}><span>اختر أصغر وحدة <b>*</b></span><select required value={draft.baseName} onChange={event => setDraft(current => ({...current, baseName: event.target.value}))}><option value="">اختر الوحدة الأساسية</option>{baseChoices.map(unit => <option key={unit.id} value={unit.name}>{unit.name}</option>)}</select></label>
        {!units.length && !draft.baseName && <p className={s.hint}>أضف الوحدة الأساسية من حقل الوحدة في بيانات الصنف أولًا</p>}
      </section>

      <datalist id={`${id}-names`}>{units.map(unit => <option key={unit.id} value={unit.name}/>)}</datalist>
      <div className={s.rows}>
        {draft.rows.map((row, index) => {
          const parents = [{id: 'base', name: draft.baseName || 'الوحدة الأساسية'}, ...draft.rows.slice(0, index).map(previous => ({id: previous.id, name: previous.name || `الوحدة ${index}`}))];
          const parentName = parents.find(parent => parent.id === row.parentId)?.name ?? '';
          const factor = factors.get(row.id);
          return <section key={row.id} className={s.row}>
            <div className={s.rowHeading}><span className={s.level}>{index + 1}</span><h3>{row.name.trim() || 'وحدة أكبر'}</h3><button type="button" className={s.remove} aria-label={`حذف ${row.name || `الوحدة ${index + 1}`}`} onClick={() => remove(row.id)}><Trash2 size={16} aria-hidden="true"/></button></div>
            <div className={s.rowFields}>
              <label className={s.field}><span>اسم الوحدة <b>*</b></span><input required maxLength={30} list={`${id}-names`} value={row.name} onChange={event => change(row.id, {name: event.target.value})} placeholder={index === 0 ? 'علبة' : index === 1 ? 'كرتون' : 'طبلية'}/></label>
              <label className={s.field}><span>تحتوي على <b>*</b></span><input required type="number" min="0.000001" max={1000000} step="0.000001" inputMode="decimal" value={row.count} onChange={event => change(row.id, {count: event.target.value})} placeholder="العدد"/></label>
              <label className={s.field}><span>من الوحدة <b>*</b></span><select value={row.parentId} onChange={event => change(row.id, {parentId: event.target.value})}>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></label>
            </div>
            <div className={s.equivalence} aria-live="polite">{factor !== undefined ? <><Check size={15} aria-hidden="true"/><span>١ {row.name} = {format(Number(row.count))} {parentName}</span>{row.parentId !== 'base' && <strong>= {format(factor)} {draft.baseName}</strong>}</> : <><ArrowDown size={15} aria-hidden="true"/><span>حدّد اسم الوحدة وعدد الوحدات التي تحتويها</span></>}</div>
          </section>;
        })}
      </div>
      <button type="button" className={s.add} disabled={!draft.baseName || draft.rows.length >= 29} onClick={() => {
        const rowId = `added-${sequence.current++}`;
        setDraft(current => ({...current, rows: [...current.rows, {id: rowId, name: '', count: '', parentId: current.rows.at(-1)?.id ?? 'base'}]}));
      }}><Plus size={18} aria-hidden="true"/>إضافة وحدة أكبر <span>علبة أو كرتون أو طبلية</span></button>
      {!!draft.rows.length && <div className={s.summary}><Boxes size={18} aria-hidden="true"/><span>كل الكميات تتحول تلقائيًا إلى <strong>{draft.baseName || 'الوحدة الأساسية'}</strong> عند البيع والشراء</span></div>}
      {detailsSlot}
    </fieldset>
    <footer className={s.footer}><p>الوحدات الإضافية اختيارية</p><div>{onCancel && <button type="button" className={s.cancel} disabled={pending} onClick={onCancel}>إلغاء</button>}<button type="submit" className={s.save} disabled={disabled}>{pending ? <LoaderCircle size={17} className={s.spin} aria-hidden="true"/> : <Save size={17} aria-hidden="true"/>}{pending ? 'جارٍ حفظ القالب' : 'حفظ قالب الوحدات'}</button></div></footer>
  </form>;
}
