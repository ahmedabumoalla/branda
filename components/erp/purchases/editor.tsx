'use client';
import { Fragment, useId, useRef, useState, type ReactNode } from 'react';
import { Package, PackagePlus, Building2, CalendarDays, WalletCards, Save, LoaderCircle, MinusCircle, Plus, SlidersHorizontal, StickyNote, Percent, Truck, Paperclip } from 'lucide-react';
import { purchaseFieldSources, purchaseTotals, type PurchaseInput, type PurchaseSnapshot, type PurchaseLine, type SupplierInput } from '@/lib/erp/purchases';
import { convertPurchaseUnitPrice } from '@/lib/erp/purchase-units';
import { TrackingRows } from '@/components/erp/inventory/tracking';
import { ErpFieldValues } from '@/components/erp/fields/field-values';
import { PurchaseProductDialog } from './product-dialog';
import { PurchaseSupplierDialog } from './supplier-dialog';
import { isMindSalesSimplified } from '@/lib/finance/sales-features';
import type { PurchaseProductSaved } from '@/lib/erp/purchase-product';
import s from './editor.module.css';
import { supplierAccountBalance } from "@/lib/erp/supplier-account";
import { PurchaseItemPicker } from './item-picker';

export type PurchaseEditorPos = { supplierBalances?: Record<string, number>; accountId: string; accountName: string; allowCredit: boolean; onCreateItem?: () => void; createProduct?: boolean; shiftId?: string; onCreateSupplier?: () => void; attachments?: ReactNode };
export function PurchaseEditor({ snapshot: initialSnapshot, value, onChange, onSave, onCancel, pending, pos, compact = false }: {
  snapshot: PurchaseSnapshot; value: PurchaseInput; onChange: (v: PurchaseInput) => void;
  onSave: () => void; onCancel: () => void; pending: boolean; pos?: PurchaseEditorPos; compact?: boolean;
}) {
  const [productOpen, setProductOpen] = useState(false);
  const [createdProducts, setCreatedProducts] = useState<PurchaseProductSaved[]>([]);
  // Suppliers added from this document stay selectable before the page snapshot refreshes.
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [createdSuppliers, setCreatedSuppliers] = useState<SupplierInput[]>([]);
  const snapshot: PurchaseSnapshot = { ...initialSnapshot,
    suppliers: [...initialSnapshot.suppliers, ...createdSuppliers.filter(created => !initialSnapshot.suppliers.some(known => known.id === created.id))],
    finance: { ...initialSnapshot.finance, items: [...initialSnapshot.finance.items.filter(i => !createdProducts.some(p => p.item.id === i.id)), ...createdProducts.map(p => p.item)], units: [...(initialSnapshot.finance.units ?? []), ...createdProducts.map(p => p.unit).filter((u, i, all) => !initialSnapshot.finance.units?.some(old => old.id === u.id) && all.findIndex(x => x.id === u.id) === i)] },
    itemDefaults: { ...initialSnapshot.itemDefaults, ...Object.fromEntries(createdProducts.map(p => [p.item.id, { buyPrice: p.buyPrice }])) },
    units: [...initialSnapshot.units, ...createdProducts.map(p => ({ itemId: p.item.id, name: p.unit.name, factor: 1 }))],
  };
  const canCreateProduct = pos ? pos.createProduct === true : ['owner', 'manager', 'warehouse'].includes(snapshot.finance.role);
  const [autoPaid, setAutoPaid] = useState(pos ? true : value.revision === 0 && snapshot.settings.defaultPaid);
  const [activeTab, setActiveTab] = useState('discount');
  const [blankRow, setBlankRow] = useState(value.lines.length === 0);
  const blankSelect = useRef<HTMLInputElement>(null);
  const unitPriceOrigins = useRef(new Map<string, { itemId: string; unit: string; price: number }>());
  const [priceDraft, setPriceDraft] = useState<{ id: string; text: string } | null>(null);
  const tabsId = useId();
  const priced = !['request', 'rfq'].includes(value.kind), totals = purchaseTotals(value);
  // Purchase price rule from purchase settings, for the owner and the cashier alike: when the option is off the
  // price comes from the item card and cannot be typed over. An item with no stored purchase price stays editable.
  const priceLocked = (l: PurchaseLine) => !snapshot.settings.updateItemPrices && !!l.itemId && Number(snapshot.itemDefaults[l.itemId]?.buyPrice ?? 0) > 0;
  const documentName = {request: 'طلب الشراء', rfq: 'طلب عرض السعر', quotation: 'عرض سعر الشراء', order: 'أمر الشراء', invoice: 'فاتورة المشتريات'}[value.kind];
  const tabs = [...(priced ? [{ id: 'discount', label: 'الخصم والتسوية' }, { id: 'shipping', label: 'الشحن' }] : []), ...(pos?.attachments ? [{ id: 'attachments', label: 'المرفقات' }] : [])];
  const selectedTab = tabs.some(tab => tab.id === activeTab) ? activeTab : tabs[0]?.id;
  const lineDiscount = snapshot.settings.discountMode !== 'invoice';
  const columnCount = priced ? (lineDiscount ? 9 : 8) : 4;
  const emptyLine: PurchaseLine = { id: 'empty-entry', itemId: '', description: '', unit: '', quantity: 1, price: 0, discount: 0, discountType: 'amount', taxRate: 0, costCenterId: null };
  const visibleLines = [...value.lines, ...(blankRow && value.lines.length < 100 ? [emptyLine] : [])];
  const availableItems = snapshot.finance.items.filter(x => x.active && !snapshot.blockedItems.includes(x.id));
  const patch = (p: Partial<PurchaseInput>) => {
    const next = { ...value, ...p };
    if ((autoPaid || pos && !pos.allowCredit) && value.kind === 'invoice' && p.paid === undefined) next.paid = purchaseTotals(next).total;
    onChange(next);
  };
  const line = (id: string, p: Partial<PurchaseLine>) => {
    if (p.price !== undefined && p.unit === undefined) unitPriceOrigins.current.delete(id);
    patch({ lines: value.lines.map(l => l.id === id ? { ...l, ...p } : l) });
  };
  function changeUnit(l: PurchaseLine, unit: string) {
    const known = unitPriceOrigins.current.get(l.id);
    const origin = known?.itemId === l.itemId ? known : { itemId: l.itemId, unit: l.unit, price: l.price };
    unitPriceOrigins.current.set(l.id, origin);
    line(l.id, { unit, price: convertPurchaseUnitPrice(origin.price, l.itemId, origin.unit, unit, snapshot.units) });
  }
  function add(itemId: string, existing?: PurchaseLine) {
    if (existing) unitPriceOrigins.current.delete(existing.id);
    const item = snapshot.finance.items.find(i => i.id === itemId); if (!item) return;
    const defaults = snapshot.itemDefaults[itemId];
    const unit = defaults?.buyUnitName || item.unit;
    const price = defaults?.buyPrice ?? convertPurchaseUnitPrice(item.average_cost, itemId, item.unit, unit, snapshot.units);
    const nextLine: PurchaseLine = { id: existing?.id ?? crypto.randomUUID(), itemId, description: item.name, unit, quantity: existing?.quantity ?? 1, price, discount: 0, discountType: 'amount', taxRate: snapshot.settings.taxMode === 'none' ? 0 : snapshot.settings.taxMode === 'specific' ? snapshot.settings.taxRate : defaults?.tax1 !== undefined ? Number(defaults.tax1) + Number(defaults.tax2 ?? 0) : snapshot.finance.settings.vat_rate, costCenterId: null };
    patch({ lines: existing ? value.lines.map(l => l.id === existing.id ? nextLine : l) : [...value.lines, nextLine] });
    if (!existing) setBlankRow(true);
  }
  return <><form dir="rtl" className={`${s.form} ${compact ? s.compact : ''}`} inert={pos && pending ? true : undefined} aria-busy={pending} onInvalidCapture={e => {
    const target = e.target as HTMLElement;
    target.closest('details')?.setAttribute('open', '');
    const panel = target.closest<HTMLElement>('[role="tabpanel"]');
    const tab = tabs.find(item => panel?.id === `${tabsId}-${item.id}-panel`);
    if (panel && tab) { panel.hidden = false; setActiveTab(tab.id); }
  }} onSubmit={e => { e.preventDefault(); if (!pending && value.lines.length > 0) onSave(); }}>
    <fieldset disabled={pending} className={s.document}>
      <legend className={s.srOnly}>بيانات مستند المشتريات</legend>
      {!compact && <header className={s.heading}><div><h2>بيانات {documentName}</h2><p>{priced ? 'حدد المورد وأضف الأصناف ثم راجع المبلغ قبل الحفظ' : 'حدد الأصناف والكميات المطلوبة ثم احفظ الطلب'}</p></div><span className={s.documentType}>{value.lines.length} أصناف</span></header>}
      <div className={s.editorLayout}><div className={s.entryColumn}>
      <div className={s.documentTop}>
        <section className={s.supplierBlock} aria-label="بيانات المورد">
          <div className={s.supplierHeading}><h2><Building2 aria-hidden="true" /> المورد والتوريد</h2>{pos?.onCreateSupplier && <button type="button" onClick={pos.onCreateSupplier}>إضافة مورد</button>}{!pos && snapshot.canCreate && <button type="button" onClick={() => setSupplierOpen(true)}>إضافة مورد</button>}</div>
          {value.kind === 'rfq' ? <label>الموردون<select multiple aria-label="الموردون المدعوون" value={value.supplierIds} onChange={e => patch({ supplierIds: Array.from(e.target.selectedOptions, x => x.value) })}>{snapshot.suppliers.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            : <label>المورد<select required={priced} value={value.supplierId ?? ''} onChange={e => patch({ supplierId: e.target.value || null })}><option value="">اختر المورد</option>{snapshot.suppliers.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
          {value.supplierId && <div className={s.supplierBalance}><span>{(pos?.supplierBalances?.[value.supplierId] ?? supplierAccountBalance(snapshot, value.supplierId)) < 0 ? 'رصيد لصالح المنشأة' : 'مديونية للمورد'}</span><strong><bdi>{Math.abs(createdSuppliers.find(row => row.id === value.supplierId)?.openingBalance ?? pos?.supplierBalances?.[value.supplierId] ?? supplierAccountBalance(snapshot, value.supplierId)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</bdi> SAR</strong></div>}
          <div className={s.supplierFields}>
            {priced && <label>العملة<input required maxLength={3} pattern="[A-Z]{3}" dir="ltr" value={value.currency} onChange={e => { const currency = e.target.value.toUpperCase(); patch({ currency, exchangeRate: currency === 'SAR' ? 1 : snapshot.settings.exchangeRates.find(x => x.currency === currency)?.rate ?? value.exchangeRate }); }} /></label>}
            {value.kind === 'invoice' && <label>المستودع<select required value={value.warehouseId ?? ''} onChange={e => patch({ warehouseId: e.target.value || null })}><option value="">اختر المستودع</option>{snapshot.finance.warehouses.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
          </div>
        </section>
        <section className={s.metadata} aria-label="بيانات المستند"><h2><CalendarDays aria-hidden="true" /> بيانات المستند</h2>
          {/* The supplier invoice number is mandatory on purchase invoices so later tax integration can match the original document. */}
          {value.kind === 'invoice' ? <label>رقم الفاتورة *<input required pattern=".*\S.*" title="أدخل رقم الفاتورة" maxLength={80} placeholder="رقم فاتورة المورد كما في الفاتورة الأصلية" value={value.number} onChange={e => patch({ number: e.target.value })} /></label> : <label>رقم المستند<input maxLength={80} placeholder="يولد عند الحفظ" value={value.number} onChange={e => patch({ number: e.target.value })} /></label>}
          <label>التاريخ<input required type="date" value={value.date} onChange={e => patch({ date: e.target.value })} /></label>
          <label>{value.kind === 'invoice' ? 'تاريخ الاستحقاق' : 'صالح حتى'}<input type="date" value={value.dueDate ?? ''} onChange={e => patch({ dueDate: e.target.value || null })} /></label>
        </section>
      </div>
      <details className={s.advanced}><summary><SlidersHorizontal aria-hidden="true"/> إعدادات إضافية للمستند</summary><div className={s.formGrid}><label>العنوان<input required maxLength={200} value={value.title} onChange={e => patch({ title: e.target.value })} /></label>
        <label>الحالة المخصصة<select value={value.customStatus} onChange={e => patch({ customStatus: e.target.value })}><option value="">بدون حالة إضافية</option>{snapshot.settings.statuses.filter(x => x.kind === value.kind).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        {priced && <>{((snapshot.settings.showExchangeRate && !isMindSalesSimplified(snapshot.slug)) || value.currency !== 'SAR') && <label>سعر التحويل إلى الريال<input required type="number" min=".000001" step=".000001" disabled={value.currency === 'SAR' || snapshot.settings.exchangeMode === 'configured'} value={value.exchangeRate} onChange={e => patch({ exchangeRate: e.target.valueAsNumber })} /></label>}<label className={s.check}><input type="checkbox" checked={value.taxInclusive} onChange={e => patch({ taxInclusive: e.target.checked })} />الأسعار شاملة الضريبة</label></>}
      </div></details>
      <section className={s.items} aria-label="أصناف المشتريات">
        <div className={s.sectionHeading}><h2><Package aria-hidden="true"/> أصناف {documentName} <span className={s.itemCount}>{value.lines.length}</span></h2><span>{priced ? (value.taxInclusive ? 'الأسعار شاملة الضريبة' : 'الأسعار غير شاملة الضريبة') : 'حدد الأصناف والكميات المطلوبة'}</span></div>
        <div className={s.tableScroll} tabIndex={0} role="region" aria-label="جدول إدخال الأصناف قابل للتمرير أفقيًا">
          <table className={s.entryTable}>
            <colgroup><col className={s.productCol} /><col className={s.descriptionCol} />{priced && <col className={s.priceCol} />}<col className={s.quantityCol} />{priced && <>{lineDiscount && <col className={s.discountCol} />}<col className={s.taxCol} /><col className={s.costCol} /><col className={s.totalCol} /></>}<col className={s.deleteCol} /></colgroup>
            <thead><tr><th scope="col">الصنف</th><th scope="col">الوصف</th>{priced && <th scope="col">سعر الوحدة</th>}<th scope="col">الكمية</th>{priced && <>{lineDiscount && <th scope="col">الخصم</th>}<th scope="col">الضريبة</th><th scope="col">مركز التكلفة</th><th scope="col">المجموع</th></>}<th scope="col"><span className={s.srOnly}>حذف الصف</span></th></tr></thead>
            <tbody>{visibleLines.map(l => <Fragment key={l.id}>
              <tr className={!l.itemId ? s.blankRow : undefined}>
                <td className={s.itemName}><PurchaseItemPicker inputRef={!l.itemId ? blankSelect : undefined} items={availableItems} value={l.itemId} onSelect={itemId => add(itemId, l.itemId ? l : undefined)} /></td>
                <td><input aria-label="وصف الصنف" disabled={!l.itemId} placeholder="الوصف" maxLength={5000} value={l.description} onChange={e => line(l.id, { description: e.target.value })} /></td>
                {priced && <td><input required={!!l.itemId} disabled={!l.itemId} aria-label="سعر الوحدة" placeholder="سعر الوحدة" type="number" min="0" step="any" readOnly={priceLocked(l)} title={priceLocked(l) ? 'سعر الشراء مثبت من بطاقة الصنف وتغييره يحتاج تفعيل الخيار من إعدادات المشتريات' : undefined}
                  value={priceDraft?.id === l.id ? priceDraft.text : l.itemId && Number.isFinite(l.price) ? Number(l.price.toFixed(4)) : ''}
                  onFocus={e => setPriceDraft({ id: l.id, text: e.currentTarget.value })}
                  onBlur={() => setPriceDraft(null)}
                  onChange={e => { setPriceDraft({ id: l.id, text: e.target.value }); line(l.id, { price: e.target.valueAsNumber }); }} /></td>}
                <td><div className={s.quantityInput}><input required={!!l.itemId} disabled={!l.itemId} aria-label="الكمية" placeholder="الكمية" type="number" min=".001" step=".001" value={l.itemId && Number.isFinite(l.quantity) ? l.quantity : ''} onChange={e => line(l.id, { quantity: e.target.valueAsNumber })} />{l.itemId && <select aria-label="وحدة الكمية" value={l.unit} onChange={e => changeUnit(l, e.target.value)}>{snapshot.units.filter((x, i, a) => x.itemId === l.itemId && a.findIndex(y => y.itemId === x.itemId && y.name === x.name) === i).map(x => <option key={x.name} value={x.name}>{x.name} × {x.factor}</option>)}</select>}</div></td>
                {priced && <>
                  {lineDiscount && <td><div className={s.rowDiscount}><input required={!!l.itemId} disabled={!l.itemId} aria-label="خصم السطر" placeholder="الخصم" type="number" min="0" step=".01" value={l.itemId && Number.isFinite(l.discount) ? l.discount : ''} onChange={e => line(l.id, { discount: e.target.valueAsNumber })} /><select disabled={!l.itemId} aria-label="نوع خصم السطر" value={l.discountType ?? 'amount'} onChange={e => line(l.id, { discountType: e.target.value as 'amount' | 'percent' })}><option value="amount">قيمة</option><option value="percent">%</option></select></div></td>}
                  <td><div className={s.taxInput}><input required={!!l.itemId} disabled={!l.itemId} aria-label="الضريبة" placeholder="بدون ضريبة" type="number" min="0" max="100" step=".01" value={l.itemId && Number.isFinite(l.taxRate) ? l.taxRate : ''} onChange={e => line(l.id, { taxRate: e.target.valueAsNumber })} /><span aria-hidden="true">%</span></div></td>
                  <td><select disabled={!l.itemId} aria-label="مركز التكلفة" value={l.costCenterId ?? ''} onChange={e => line(l.id, { costCenterId: e.target.value || null })}><option value="">مركز التكلفة</option>{snapshot.costCenters.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
                  <td className={s.lineTotal}><bdi>{(totals.rows.find(x => x.id === l.id)?.total ?? 0).toFixed(2)}</bdi><small>{value.currency}</small></td>
                </>}
                <td className={s.removeCell}><button type="button" className={s.remove} aria-label={l.itemId ? 'حذف ' + (snapshot.finance.items.find(x => x.id === l.itemId)?.name ?? 'الصنف') : 'حذف الصف الفارغ'} onClick={() => { if (!l.itemId) setBlankRow(false); else patch({ lines: value.lines.filter(x => x.id !== l.id) }); }}><MinusCircle aria-hidden="true" /></button></td>
              </tr>
              {l.itemId && snapshot.itemDefaults[l.itemId]?.trackingMode && snapshot.itemDefaults[l.itemId].trackingMode !== 'quantity' && <tr className={s.trackingRow}><td colSpan={columnCount}><TrackingRows mode={snapshot.itemDefaults[l.itemId].trackingMode!} value={l.tracking ?? []} onChange={tracking => line(l.id, { tracking })} expected={l.quantity * (snapshot.units.find(x => x.itemId === l.itemId && x.name === l.unit)?.factor ?? 1)} disabled={pending} /></td></tr>}
            </Fragment>)}</tbody>
          </table>
        </div>
        <div className={s.belowTable}>
          <div className={s.rowActions}><button type="button" disabled={value.lines.length >= 100} onClick={() => { setBlankRow(true); requestAnimationFrame(() => blankSelect.current?.focus()); }}><Plus aria-hidden="true" /> إضافة صف</button>{canCreateProduct && <button type="button" onClick={() => setProductOpen(true)}><PackagePlus aria-hidden="true" /> إضافة منتج</button>}</div>
          {priced && <dl className={s.tableTotals}><div><dt>الصافي</dt><dd><bdi>{totals.net.toFixed(2)}</bdi><small>{value.currency}</small></dd></div><div><dt>الضريبة</dt><dd><bdi>{totals.tax.toFixed(2)}</bdi><small>{value.currency}</small></dd></div><div className={s.tableGrandTotal}><dt>الإجمالي</dt><dd><bdi>{totals.total.toFixed(2)}</bdi><small>{value.currency}</small></dd></div>{value.currency !== 'SAR' && <div><dt>القيمة بالريال</dt><dd><bdi>{totals.sarTotal.toFixed(2)}</bdi><small>SAR</small></dd></div>}</dl>}
        </div>
      </section>
      {!!tabs.length && <div className={s.calculation}>
        <section className={s.extras}>{!!tabs.length && <>
          <div className={s.tabs} role="tablist" aria-label="إضافات المستند">{tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${tabsId}-${tab.id}`} aria-selected={selectedTab === tab.id} aria-controls={`${tabsId}-${tab.id}-panel`} tabIndex={selectedTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={e => {
            let next: number | undefined;
            if (e.key === 'ArrowLeft') next = (index + 1) % tabs.length;
            if (e.key === 'ArrowRight') next = (index + tabs.length - 1) % tabs.length;
            if (e.key === 'Home') next = 0; if (e.key === 'End') next = tabs.length - 1;
            if (next !== undefined) { e.preventDefault(); setActiveTab(tabs[next].id); document.getElementById(`${tabsId}-${tabs[next].id}`)?.focus(); }
          }}>{tab.id === 'discount' ? <Percent aria-hidden="true"/> : tab.id === 'shipping' ? <Truck aria-hidden="true"/> : <Paperclip aria-hidden="true"/>}{tab.label}</button>)}</div>
          {priced && <><div role="tabpanel" id={`${tabsId}-discount-panel`} aria-labelledby={`${tabsId}-discount`} hidden={selectedTab !== 'discount'} className={s.tabPanel}><div className={s.formGrid}>
            {snapshot.settings.discountMode !== 'line' && <label>خصم {documentName}<div className={s.discountInput}><input type="number" min="0" step=".01" value={value.discount} onChange={e => patch({ discount: e.target.valueAsNumber })} /><select aria-label={`نوع خصم ${documentName}`} value={value.discountType ?? 'amount'} onChange={e => patch({ discountType: e.target.value as 'amount' | 'percent' })}><option value="amount">قيمة</option><option value="percent">نسبة %</option></select></div></label>}
            {snapshot.settings.allowAdjustment && <><label>{snapshot.settings.adjustmentLabel}<input type="number" step=".01" value={value.adjustment} onChange={e => patch({ adjustment: e.target.valueAsNumber })} /></label><label>حساب التسوية<select value={value.adjustmentAccountId ?? ''} onChange={e => patch({ adjustmentAccountId: e.target.value || null })}><option value="">اختر الحساب</option>{snapshot.finance.accounts.filter(x => x.active && ['expense', 'inventory'].includes(x.kind)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label></>}
            {snapshot.settings.discountMode === 'line' && !snapshot.settings.allowAdjustment && <p className={s.hint}>يحدد الخصم لكل صنف داخل الجدول</p>}
          </div></div><div role="tabpanel" id={`${tabsId}-shipping-panel`} aria-labelledby={`${tabsId}-shipping`} hidden={selectedTab !== 'shipping'} className={s.tabPanel}><label>مصاريف الشحن<input type="number" min="0" step=".01" value={value.shipping} onChange={e => patch({ shipping: e.target.valueAsNumber })} /></label></div></>}
          {pos?.attachments && <div role="tabpanel" id={`${tabsId}-attachments-panel`} aria-labelledby={`${tabsId}-attachments`} hidden={selectedTab !== 'attachments'} className={s.tabPanel}>{pos.attachments}</div>}
        </>}</section>

      </div>}
      <div className={s.customFields}><ErpFieldValues fields={snapshot.settings.fields} values={value.customValues} update={(key, v) => patch({ customValues: { ...value.customValues, [key]: v } })} sources={purchaseFieldSources(snapshot)} fileContext={value.revision > 0 ? { slug: snapshot.slug, recordId: value.id, entityType: 'purchase_document' } : undefined} /></div>
      <details className={s.notes} open={value.note || value.terms ? true : undefined}><summary><StickyNote aria-hidden="true"/> ملاحظات وشروط <small>اختياري</small></summary><div className={s.formGrid}><label>الملاحظات<textarea rows={3} maxLength={1000} value={value.note} onChange={e => patch({ note: e.target.value })} /></label><label>الشروط والأحكام<textarea rows={3} maxLength={5000} value={value.terms} onChange={e => patch({ terms: e.target.value })} /></label></div></details>

      </div><div className={s.summaryColumn}>
      {value.kind === 'invoice' && <section className={s.payment} aria-label="بيانات الدفع"><h2><WalletCards aria-hidden="true" /> السداد والاستلام</h2>
        <label className={s.check}><input type="checkbox" disabled={!!pos && !pos.allowCredit} checked={autoPaid || value.paid > 0} onChange={e => { setAutoPaid(e.target.checked); patch({ paid: e.target.checked ? totals.total : 0 }); }} />الفاتورة مدفوعة</label>
        <div className={s.paymentFields}><label>حساب الدفع<select disabled={!!pos} required={value.paid > 0} value={value.accountId ?? ''} onChange={e => patch({ accountId: e.target.value || null })}><option value="">اختر الحساب</option>{snapshot.finance.accounts.filter(x => pos ? x.id === pos.accountId : x.active && !x.is_cashier_drawer && ['cash', 'bank'].includes(x.kind)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>المبلغ المدفوع<input type="number" min="0" readOnly={!!pos && !pos.allowCredit} max={totals.total} step=".01" value={value.paid} onChange={e => { setAutoPaid(false); patch({ paid: e.target.valueAsNumber }); }} /></label></div>
        {snapshot.settings.warehouseRequisitions && <label className={s.check}><input type="checkbox" checked={value.received} onChange={e => patch({ received: e.target.checked })} />استلام البضاعة عند إصدار الفاتورة</label>}
      </section>}</div></div>
    </fieldset>
    <footer className={s.footer}><div className={s.footerMain}>{priced && <div className={s.footerAmount}><span>إجمالي {documentName}</span><strong>{totals.total.toFixed(2)} <small>{value.currency}</small></strong></div>}<div className={s.actions}><button className={s.primary} disabled={pending || !value.lines.length}>{pending ? <LoaderCircle className={s.spin} aria-hidden="true" /> : <Save aria-hidden="true" />}{pending ? 'جارٍ الحفظ' : pos ? 'إصدار فاتورة المشتريات' : 'حفظ المسودة'}</button><button type="button" disabled={!!pos && pending} onClick={onCancel}>إلغاء</button></div></div><p className={s.hint}>{pos ? 'تصدر الفاتورة وترتبط بالوردية ويُسجل أثرها المالي والمخزني' : 'يحفظ المستند مسودة وتظهر خيارات الاعتماد أو الإصدار في صفحة تفاصيله'}</p></footer>
  </form>{productOpen && <PurchaseProductDialog snapshot={snapshot.finance} categories={snapshot.categories} sellers={snapshot.suppliers.map(x => x.name)} shiftId={pos?.shiftId} onClose={() => setProductOpen(false)} onSaved={product => {
    setCreatedProducts(current => [...current.filter(p => p.item.id !== product.item.id), product]);
    const item = product.item;
    patch({ lines: [...value.lines, { id: crypto.randomUUID(), itemId: item.id, description: item.name, unit: product.unit.name, quantity: 1, price: product.buyPrice, discount: 0, discountType: 'amount', taxRate: snapshot.settings.taxMode === 'none' ? 0 : snapshot.settings.taxMode === 'specific' ? snapshot.settings.taxRate : snapshot.finance.settings.vat_rate, costCenterId: null }] });
    setBlankRow(false); setProductOpen(false);
  }} />}{supplierOpen && <PurchaseSupplierDialog snapshot={snapshot} onClose={() => setSupplierOpen(false)} onSaved={supplier => {
    setCreatedSuppliers(current => [...current.filter(known => known.id !== supplier.id), supplier]);
    patch(value.kind === 'rfq' ? { supplierIds: [...value.supplierIds.filter(id => id !== supplier.id), supplier.id] } : { supplierId: supplier.id });
    setSupplierOpen(false);
  }} />}</>;
}
