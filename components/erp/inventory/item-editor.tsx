'use client';

import {useId, useRef, useState, type ReactNode} from 'react';
import {Barcode, ChevronDown, Layers3, LoaderCircle, Package, Plus, Save, SlidersHorizontal, Tags, TrendingUp, Warehouse} from 'lucide-react';
import {BundleRecipe, type BundleComponent} from './lifecycle';
import {trackingModes} from '@/lib/erp/inventory-tracking';
import {inventoryItemInput, inventoryItemSchema, type InventorySnapshot, type InventoryItem, type InventoryCatalog, type InventoryItemInput} from '@/lib/erp/inventory';
import {executeInventory} from '@/app/actions/erp-inventory';
import {saveFinanceInventoryUnitAction} from '@/app/actions/finance-inventory-catalog';
import {withBranchScope} from '@/components/erp/branches/context';
import {CreatableSelect} from './creatable-select';
import {UnitTemplateDialog} from './unit-template-dialog';
import {ErpFieldValues} from '@/components/erp/fields/field-values';
import type {ErpCustomField} from '@/lib/erp/custom-fields';
import {Select, type SaveInventory} from './ui';
import s from './item-editor.module.css';

function Field({label, children, wide = false, hint}: {label: string; children: ReactNode; wide?: boolean; hint?: string}) {
  return <label className={`${s.field} ${wide ? s.wide : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function SectionTitle({icon, title, note}: {icon: ReactNode; title: string; note?: string}) {
  return <header className={s.sectionTitle}><span className={s.sectionIcon} aria-hidden="true">{icon}</span><div><h2>{title}</h2>{note && <p>{note}</p>}</div></header>;
}

export function ItemEditor({snapshot, item, save, busy}: {snapshot: InventorySnapshot; item?: InventoryItem; save: SaveInventory; busy: boolean}) {
  const [d, setD] = useState(() => {
    const value = inventoryItemInput(item);
    return !item && snapshot.productDefaults ? {...value, kind: snapshot.productDefaults.soldItemType, payload: {...value.payload, tax1: snapshot.productDefaults.tax1, tax2: snapshot.productDefaults.tax2}} : value;
  });
  const [error, setError] = useState('');
  const [addedCatalogs, setAddedCatalogs] = useState<InventoryCatalog[]>([]);
  const [addedUnits, setAddedUnits] = useState<{id: string; name: string}[]>([]);
  const [lookupPending, setLookupPending] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const lookupLock = useRef(false);
  const lookupRequests = useRef(new Map<string, string>());
  const priceFromMargin = useRef(Number(item?.meta.payload.margin ?? 0) > 0);
  const errorId = useId();
  const templateFieldId = useId();
  const set = (key: string, value: unknown) => setD(current => ({...current, [key]: value}));
  function detail(key: string, value: unknown) {
    if (key === 'margin') priceFromMargin.current = true;
    if (key === 'salePrice') priceFromMargin.current = false;
    const recalculate = priceFromMargin.current && ['margin', 'buyPrice', 'buyUnitName', 'saleUnitName'].includes(key);
    setD(current => {
      const next = {...current, payload: {...current.payload, [key]: value}};
      return recalculate ? applyMargin(next) : next;
    });
  }
  const catalogs = [...snapshot.catalogs, ...addedCatalogs.filter(row => !snapshot.catalogs.some(existing => existing.id === row.id))];
  const units = [...snapshot.units, ...addedUnits.filter(row => !snapshot.units.some(existing => existing.id === row.id))];
  const catalog = (kind: string) => catalogs.filter(row => row.kind === kind && row.active);
  const fields = (snapshot.settings.payload.itemFields ?? []) as ErpCustomField[];
  const disabled = busy || lookupPending || templateOpen || !(item ? snapshot.canUpdate : snapshot.canCreate);
  function markLookupPending(pending: boolean) { lookupLock.current = pending; setLookupPending(pending); }
  async function createLookup(kind: 'brand' | 'category' | 'unit', typedName: string) {
    if (!snapshot.canCreate) throw new Error('لا تملك صلاحية إضافة سجل جديد');
    const name = typedName.trim();
    const maxLength = kind === 'unit' ? 30 : 150;
    if (!name || name.length > maxLength) throw new Error(`اكتب اسمًا من حرف إلى ${maxLength} حرفًا`);
    const existing = (kind === 'unit' ? units : catalog(kind)).find(row => row.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return {id: existing.id, name: existing.name};
    const scope = withBranchScope({}, snapshot).branchScope;
    const key = JSON.stringify([snapshot.slug, kind, name, kind === 'unit' ? null : scope]);
    let requestId = lookupRequests.current.get(key);
    if (!requestId) { requestId = crypto.randomUUID(); lookupRequests.current.set(key, requestId); }
    if (kind === 'unit') {
      const result = await saveFinanceInventoryUnitAction({name, requestId}, snapshot.slug);
      if (!result.ok) throw new Error(result.message);
      if (!result.unit?.id) throw new Error('تعذر تأكيد حفظ الوحدة أعد المحاولة بنفس الاسم');
      setAddedUnits(rows => [...rows.filter(row => row.id !== result.unit.id), result.unit]);
      return result.unit;
    }
    const result = await executeInventory(withBranchScope({action: 'catalog', payload: {kind, name, active: true}, requestId, id: '', revision: 0}, snapshot), snapshot.slug);
    if (!result.ok) throw new Error(result.message);
    if (!result.data?.id) throw new Error('تعذر تأكيد الحفظ أعد المحاولة بنفس الاسم');
    const row: InventoryCatalog = {id: result.data.id, name, kind, active: true, payload: {}, revision: 1};
    setAddedCatalogs(rows => [...rows.filter(existing => existing.id !== row.id), row]);
    return {id: row.id, name: row.name};
  }
  const money = (value: unknown) => Number(value ?? 0).toLocaleString('ar-SA', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const selectedTemplate = catalogs.find(row => row.id === d.unitTemplateId && row.kind === 'unit_template');
  const templateUnits = (selectedTemplate?.payload.units ?? []) as {name: string; factor: number}[];
  const unitOptions = templateUnits.map(unit => ({id: unit.name, name: unit.name}));
  function applyMargin(value: InventoryItemInput, template = catalogs.find(row => row.id === value.unitTemplateId && row.kind === 'unit_template')): InventoryItemInput {
    const templateUnits = (template?.payload.units ?? []) as {name: string; factor: number}[];
    const baseName = units.find(unit => unit.id === value.unitId)?.name ?? '';
    const factor = (name: unknown) => template ? Number(templateUnits.find(unit => unit.name === String(name || baseName))?.factor) : 1;
    const buyFactor = factor(value.payload.buyUnitName);
    const saleFactor = factor(value.payload.saleUnitName);
    const cost = Number(value.payload.buyPrice ?? 0);
    const margin = Number(value.payload.margin ?? 0);
    if (![cost, margin, buyFactor, saleFactor].every(Number.isFinite) || cost < 0 || margin < 0 || buyFactor <= 0 || saleFactor <= 0) return value;
    // Prices are per selected unit; apply the markup to cost in the sale unit.
    const salePrice = Math.round((cost / buyFactor * saleFactor * (1 + margin / 100) + Number.EPSILON) * 100) / 100;
    return {...value, payload: {...value.payload, salePrice}};
  }
  function applyTemplate(template?: InventoryCatalog) {
    const recalculate = priceFromMargin.current;
    if (!template) {
      const baseName = units.find(unit => unit.id === d.unitId)?.name ?? '';
      setD(current => {
        const next = {...current, unitTemplateId: '', payload: {...current.payload, buyUnitName: baseName, saleUnitName: baseName}};
        return recalculate ? applyMargin(next) : next;
      });
      return;
    }
    const templateUnits = (template.payload.units ?? []) as {name: string; factor: number}[];
    const base = templateUnits.find(unit => Number(unit.factor) === 1);
    const baseUnit = units.find(unit => unit.name === base?.name);
    if (!baseUnit) { setError('وحدة أساس القالب غير متاحة حدّث البيانات ثم اختر القالب'); return; }
    setError('');
    setD(current => {
      const next = {...current, unitTemplateId: template.id, unitId: baseUnit.id, payload: {...current.payload,
        buyUnitName: templateUnits.some(unit => unit.name === current.payload.buyUnitName) ? current.payload.buyUnitName : baseUnit.name,
        saleUnitName: templateUnits.some(unit => unit.name === current.payload.saleUnitName) ? current.payload.saleUnitName : baseUnit.name,
      }};
      return recalculate ? applyMargin(next, template) : next;
    });
  }
  const showTrackingMode = Boolean(snapshot.settings.payload.trackingEnabled || item?.meta.tracking_mode && item.meta.tracking_mode !== 'quantity');
  const showBundle = d.kind === 'product' && Boolean(snapshot.settings.payload.bundlesEnabled || Array.isArray(d.payload.bundleComponents) && d.payload.bundleComponents.length > 0);
  const priceInput = (key: string, label: string, suffix?: string) => <Field label={label}><span className={s.amountInput}><input type="number" aria-label={label} min={0} max={key.startsWith('tax') ? 100 : 1e9} step="0.01" value={Number(d.payload[key] ?? 0)} onChange={event => detail(key, Number(event.target.value))}/>{suffix && <span aria-hidden="true">{suffix}</span>}</span></Field>;

  return <><form className={s.form} dir="rtl" aria-busy={busy || lookupPending} aria-describedby={error ? errorId : undefined} onSubmit={async event => {
    event.preventDefault();
    if (disabled || lookupLock.current) return;
    const parsed = inventoryItemSchema.safeParse(d);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'راجع بيانات الصنف'); return; }
    setError('');
    await save('item', parsed.data, item?.id, item?.meta.revision ?? 0);
  }}>
    {error && <p id={errorId} role="alert" className={s.error}>{error}</p>}
    <fieldset className={s.controls} disabled={disabled}>
      <legend className={s.srOnly}>{item ? 'تعديل بيانات الصنف' : 'بيانات الصنف الجديد'}</legend>
      <div className={s.columns}>
        <section className={s.card}>
          <SectionTitle icon={<Package size={20}/>} title="تفاصيل الصنف" note="الاسم والتصنيف ووحدات التعامل"/>
          <div className={s.cardBody}>
            <div className={s.identityRow}>
              <Field label="اسم الصنف *"><input required maxLength={150} placeholder="مثل حبوب قهوة أو أكواب ورقية" autoComplete="off" value={d.name} onChange={event => set('name', event.target.value)}/></Field>
              <Field label="رمز الصنف SKU"><input dir="ltr" maxLength={60} placeholder="اختياري" value={d.sku} onChange={event => set('sku', event.target.value)}/></Field>
            </div>
            <Field label="الوصف (اختياري)"><textarea rows={3} placeholder="تفاصيل تساعدك على تمييز الصنف" value={String(d.payload.description ?? '')} onChange={event => detail('description', event.target.value)}/></Field>
            <div className={s.grid}>
              <CreatableSelect label="التصنيف" value={d.categoryId} onChange={value => set('categoryId', value)} options={catalog('category')} onCreate={name => createLookup('category', name)} canCreate={snapshot.canCreate} disabled={disabled} maxLength={150} onPendingChange={markLookupPending}/>
              <CreatableSelect label="الماركة" value={d.brandId} onChange={value => set('brandId', value)} options={catalog('brand')} onCreate={name => createLookup('brand', name)} canCreate={snapshot.canCreate} disabled={disabled} maxLength={150} onPendingChange={markLookupPending}/>
              <Field label="نوع الصنف"><select value={d.kind} onChange={event => set('kind', event.target.value)}><option value="product">صنف مخزني</option><option value="service">خدمة</option><option value="work">بند عمل</option></select></Field>
              <div><CreatableSelect label="الوحدة الأساسية" value={d.unitId} onChange={value => set('unitId', value)} options={units} onCreate={name => createLookup('unit', name)} canCreate={snapshot.canCreate} disabled={disabled || !!selectedTemplate} maxLength={30} onPendingChange={markLookupPending}/>{selectedTemplate && <p className={s.unitHint}>الوحدة الأساسية مرتبطة بالقالب المختار</p>}</div>
              <div className={s.field}><label htmlFor={templateFieldId}>قالب الوحدات</label><select id={templateFieldId} value={d.unitTemplateId} onChange={event => applyTemplate(catalog('unit_template').find(row => row.id === event.target.value))}><option value="">بدون قالب وحدات</option>{catalog('unit_template').map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>{snapshot.canCreate && <button type="button" className={s.addTemplate} onClick={() => setTemplateOpen(true)}><Plus size={15} aria-hidden="true"/>إضافة قالب وحدات</button>}</div>
              <Field label="الباركود"><span className={s.barcodeInput}><Barcode size={20} aria-hidden="true"/><input dir="ltr" maxLength={64} placeholder="اكتب الباركود أو استخدم القارئ" value={d.barcode} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} onChange={event => set('barcode', event.target.value)}/></span></Field>
            </div>
          </div>
        </section>
        <section className={s.card}>
          <SectionTitle icon={<TrendingUp size={20}/>} title="التسعير والضريبة" note="أسعار الصنف والخصم الافتراضي"/>
          <div className={s.cardBody}>
            <div className={s.priceRow}><div className={s.priceWithUnit}>{priceInput('buyPrice', 'سعر الشراء', 'ر.س')}{selectedTemplate && <Field label="سعر الشراء لكل"><Select value={String(d.payload.buyUnitName || units.find(unit => unit.id === d.unitId)?.name || '')} onChange={value => detail('buyUnitName', value)} options={unitOptions} required/></Field>}</div><div className={s.priceWithUnit}>{priceInput('salePrice', 'سعر البيع', 'ر.س')}{selectedTemplate && <Field label="سعر البيع لكل"><Select value={String(d.payload.saleUnitName || units.find(unit => unit.id === d.unitId)?.name || '')} onChange={value => detail('saleUnitName', value)} options={unitOptions} required/></Field>}</div></div>
            <div className={s.priceSummary}><span>سعر البيع المسجّل{selectedTemplate ? ` لكل ${String(d.payload.saleUnitName || units.find(unit => unit.id === d.unitId)?.name || '')}` : ''}</span><strong>{money(d.payload.salePrice)} <small>ر.س</small></strong></div>
            {selectedTemplate && <div className={s.unitEquivalents}>{templateUnits.filter(unit => Number(unit.factor) !== 1).map(unit => <span key={unit.name}>{unit.name} = {Number(unit.factor).toLocaleString('ar-SA', {maximumFractionDigits: 6})} {units.find(base => base.id === d.unitId)?.name}</span>)}</div>}
            <div className={s.grid}>{priceInput('minimumPrice', 'أقل سعر بيع', 'ر.س')}{priceInput('margin', 'هامش الربح', '%')}{priceInput('tax1', 'الضريبة الأولى', '%')}{priceInput('tax2', 'الضريبة الثانية', '%')}</div>
            <div className={s.discountSection}><h3><Tags size={17} aria-hidden="true"/> خصم الصنف</h3><div className={s.grid}>
              {priceInput('discount', 'قيمة الخصم', d.payload.discountType === 'amount' ? 'ر.س' : '%')}
              <Field label="نوع الخصم"><select value={String(d.payload.discountType ?? 'percent')} onChange={event => detail('discountType', event.target.value)}><option value="percent">نسبة مئوية</option><option value="amount">مبلغ ثابت</option></select></Field>
            </div></div>
          </div>
        </section>
      </div>
      {d.kind === 'product' && <section className={`${s.card} ${s.stockCard}`}>
        <SectionTitle icon={<Warehouse size={20}/>} title="إدارة المخزون" note="حدد الحد الذي يبدأ عنده تنبيه انخفاض المخزون"/>
        <div className={s.stockFields}>
          {showTrackingMode && <Field label="طريقة التتبع"><select value={String(d.payload.trackingMode ?? item?.meta.tracking_mode ?? 'quantity')} onChange={event => detail('trackingMode', event.target.value)}>{Object.entries(trackingModes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
          <Field label="حد التنبيه" hint="ينبّهك النظام عندما تقل الكمية المتوفرة عن هذا الحد"><span className={s.amountInput}><input aria-label="حد التنبيه لانخفاض المخزون" type="number" min={0} step="0.001" value={d.minQuantity} onChange={event => set('minQuantity', Number(event.target.value))}/><span>{units.find(unit => unit.id === d.unitId)?.name ?? 'وحدة'}</span></span></Field>
        </div>
      </section>}
      {showBundle && <details className={s.disclosure} open={Array.isArray(d.payload.bundleComponents) && d.payload.bundleComponents.length > 0 ? true : undefined}><summary><span><Layers3 size={20} aria-hidden="true"/><strong>مكونات الصنف المركب</strong><small>اختياري</small></span><ChevronDown size={18} aria-hidden="true"/></summary><div className={s.bundle}><BundleRecipe snapshot={snapshot} itemId={item?.id} value={(d.payload.bundleComponents ?? []) as BundleComponent[]} onChange={value => detail('bundleComponents', value)} disabled={disabled || !snapshot.settings.payload.bundlesEnabled}/></div></details>}
      <details className={s.disclosure} open={fields.length > 0 || !!d.payload.note || !!d.payload.secondaryName || !!d.payload.tags ? true : undefined}>
        <summary><span><SlidersHorizontal size={20} aria-hidden="true"/><strong>تفاصيل إضافية</strong><small>الاسم الثانوي والملاحظات والوسوم</small></span><ChevronDown size={18} aria-hidden="true"/></summary>
        <div className={s.cardBody}><div className={s.grid}>
          <Field label="الاسم باللغة الثانوية"><input maxLength={150} value={String(d.payload.secondaryName ?? '')} onChange={event => detail('secondaryName', event.target.value)}/></Field>
          <Field label="الوسوم"><input placeholder="كلمات تسهّل البحث عن الصنف" value={String(d.payload.tags ?? '')} onChange={event => detail('tags', event.target.value)}/></Field>
          <Field label="ملاحظات داخلية" wide><textarea rows={3} placeholder="ملاحظات لفريق العمل" value={String(d.payload.note ?? '')} onChange={event => detail('note', event.target.value)}/></Field>
        </div><ErpFieldValues fields={fields} values={(d.payload.customValues ?? {}) as Record<string, unknown>} update={(key, value) => detail('customValues', {...(d.payload.customValues as object ?? {}), [key]: value})} fileContext={item ? {slug: snapshot.slug, recordId: item.id, entityType: 'inventory_item'} : undefined}/></div>
      </details>
    </fieldset>
    <footer className={s.footer}>
      <label className={s.status}><span>حالة الصنف</span><select aria-label="حالة الصنف" disabled={disabled} value={d.status} onChange={event => set('status', event.target.value)}><option value="active">نشط</option><option value="stopped">موقوف</option><option value="inactive">غير نشط</option></select></label>
      <button type="submit" className={s.save} disabled={disabled}>{busy ? <LoaderCircle size={18} className={s.spin} aria-hidden="true"/> : <Save size={18} aria-hidden="true"/>}{busy ? 'جارٍ حفظ الصنف' : item ? 'حفظ التعديلات' : 'حفظ الصنف'}</button>
    </footer>
  </form>{templateOpen && <UnitTemplateDialog snapshot={{...snapshot, catalogs, units}} onClose={() => setTemplateOpen(false)} onSaved={template => { setAddedCatalogs(rows => [...rows.filter(row => row.id !== template.id), template]); applyTemplate(template); setTemplateOpen(false); }}/>}</>;
}
