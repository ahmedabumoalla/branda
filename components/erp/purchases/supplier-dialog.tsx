'use client';
import { useId, useRef, useState } from 'react';
import { Building2, LoaderCircle, Plus, Save, Trash2, WalletCards } from 'lucide-react';
import { Modal } from '@/components/dashboard/ui/modal';
import { actPurchases } from '@/app/actions/erp-purchases';
import { withBranchScope } from '@/components/erp/branches/context';
import { newSupplier, supplierSchema, type PurchaseSnapshot, type SupplierInput } from '@/lib/erp/purchases';
import s from './supplier-dialog.module.css';

type TextKey = 'name' | 'firstName' | 'lastName' | 'phone' | 'mobile' | 'email' | 'taxNumber' | 'commercialRegistration' | 'number';
type AddressKey = keyof SupplierInput['address'];

// Adds a supplier without leaving the purchase document. It saves through the same supplier command
// used by the suppliers page, so numbering, opening balance posting and permissions stay with the server.
export function PurchaseSupplierDialog({ snapshot, onClose, onSaved }: {
  snapshot: PurchaseSnapshot; onClose: () => void; onSaved: (supplier: SupplierInput) => void;
}) {
  const [draft, setDraft] = useState<SupplierInput>(() => newSupplier());
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), retry = useRef({ body: '', id: '' });
  const formId = useId();
  const owner = snapshot.finance.role === 'owner';
  const patch = (change: Partial<SupplierInput>) => setDraft(value => ({ ...value, ...change }));
  const text = (key: TextKey, label: string, options: { required?: boolean; type?: string; max?: number; optional?: boolean; dir?: 'ltr' } = {}) =>
    <label className={s.field}><span>{label}{options.required && <b aria-hidden="true"> *</b>}{options.optional && <small> اختياري</small>}</span>
      <input required={options.required} type={options.type ?? 'text'} dir={options.dir} maxLength={options.max ?? 200} value={draft[key]} onChange={event => patch({ [key]: event.target.value })} /></label>;
  const address = (key: AddressKey, label: string, max = 100) =>
    <label className={s.field}><span>{label}</span><input maxLength={max} value={draft.address[key]} onChange={event => patch({ address: { ...draft.address, [key]: event.target.value } })} /></label>;

  async function save() {
    if (lock.current) return;
    setError('');
    const parsed = supplierSchema.safeParse({ ...draft, name: draft.name.trim(), openingBalance: Number.isFinite(draft.openingBalance) ? draft.openingBalance : 0 });
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? '');
      setError(field === 'name' ? 'أدخل الاسم التجاري للمورد' : field === 'email' ? 'أدخل بريدا إلكترونيا صحيحا أو اتركه فارغا' : field === 'currency' ? 'العملة ثلاثة أحرف إنجليزية مثل SAR' : field === 'openingDate' ? 'اختر تاريخ الرصيد الافتتاحي' : 'راجع بيانات المورد ثم أعد الحفظ');
      return;
    }
    const command = { action: 'supplier' as const, payload: parsed.data };
    const body = JSON.stringify(command);
    if (retry.current.body !== body) retry.current = { body, id: crypto.randomUUID() };
    lock.current = true; setBusy(true);
    try {
      const result = await actPurchases(snapshot.slug, withBranchScope(command, snapshot), retry.current.id);
      if (!result.ok) { setError(result.message); return; }
      onSaved({ ...parsed.data, id: result.data.id ?? parsed.data.id });
    } catch { setError('تعذر تأكيد حفظ المورد أعد المحاولة بنفس البيانات لمنع التكرار'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Modal open title="إضافة مورد" onClose={() => { if (!lock.current) onClose(); }} panelClassName={s.panel}
    footer={<><button type="button" className={s.secondary} disabled={busy} onClick={onClose}>إلغاء</button><button type="submit" form={formId} className={s.primary} disabled={busy}>{busy ? <LoaderCircle className={s.spin} size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{busy ? 'جار الحفظ' : 'حفظ المورد'}</button></>}>
    <form id={formId} className={s.form} onSubmit={event => { event.preventDefault(); event.stopPropagation(); void save(); }}>
      {error && <p className={s.error} role="alert">{error}</p>}
      <fieldset disabled={busy} className={s.columns}>
        <section className={s.card} aria-labelledby={`${formId}-supplier`}>
          <h3 id={`${formId}-supplier`}><Building2 size={18} aria-hidden="true" />بيانات المورد</h3>
          <div className={s.grid}>
            <div className={s.full}>{text('name', 'الاسم التجاري', { required: true, max: 160 })}</div>
            {text('firstName', 'الاسم الأول', { max: 80 })}
            {text('lastName', 'الاسم الأخير', { max: 80 })}
            {text('phone', 'الهاتف', { max: 30, type: 'tel', dir: 'ltr' })}
            {text('mobile', 'جوال', { max: 30, type: 'tel', dir: 'ltr' })}
          </div>
          <div className={s.grid3}>
            {address('building', 'رقم المبنى')}
            {address('street', 'اسم الشارع', 200)}
            {address('additional', 'الرقم الفرعي')}
          </div>
          <div className={s.grid4}>
            {address('district', 'الحي')}
            {address('city', 'المدينة')}
            {address('postal', 'الرمز البريدي', 30)}
            {address('short', 'العنوان المختصر', 80)}
          </div>
          <div className={s.grid}>
            <div className={s.full}>{address('country', 'البلد', 80)}</div>
            {text('taxNumber', 'الرقم الضريبي', { max: 30, optional: true, dir: 'ltr' })}
            {text('commercialRegistration', 'سجل تجاري / رقم موحد', { max: 50, optional: true, dir: 'ltr' })}
          </div>
          <label className={s.check}><input type="checkbox" checked={draft.addresses.length > 0} onChange={event => patch({ addresses: event.target.checked ? [{ label: '', address: '' }] : [] })} />إضافة عنوان ثانوي</label>
          {draft.addresses.map((row, index) => <div className={s.extra} key={index}>
            <label className={s.field}><span>اسم العنوان</span><input maxLength={80} value={row.label} onChange={event => patch({ addresses: draft.addresses.map((other, n) => n === index ? { ...other, label: event.target.value } : other) })} /></label>
            <label className={s.field}><span>العنوان</span><input maxLength={1000} value={row.address} onChange={event => patch({ addresses: draft.addresses.map((other, n) => n === index ? { ...other, address: event.target.value } : other) })} /></label>
            <button type="button" className={s.remove} aria-label={`حذف العنوان الثانوي ${index + 1}`} onClick={() => patch({ addresses: draft.addresses.filter((_, n) => n !== index) })}><Trash2 size={16} aria-hidden="true" /></button>
          </div>)}
          {draft.contacts.map((row, index) => <div className={s.extra} data-columns="3" key={index}>
            <label className={s.field}><span>اسم جهة الاتصال</span><input maxLength={160} value={row.name} onChange={event => patch({ contacts: draft.contacts.map((other, n) => n === index ? { ...other, name: event.target.value } : other) })} /></label>
            <label className={s.field}><span>الهاتف</span><input type="tel" dir="ltr" maxLength={30} value={row.phone} onChange={event => patch({ contacts: draft.contacts.map((other, n) => n === index ? { ...other, phone: event.target.value } : other) })} /></label>
            <label className={s.field}><span>البريد</span><input dir="ltr" maxLength={200} value={row.email} onChange={event => patch({ contacts: draft.contacts.map((other, n) => n === index ? { ...other, email: event.target.value } : other) })} /></label>
            <button type="button" className={s.remove} aria-label={`حذف جهة الاتصال ${index + 1}`} onClick={() => patch({ contacts: draft.contacts.filter((_, n) => n !== index) })}><Trash2 size={16} aria-hidden="true" /></button>
          </div>)}
          <button type="button" className={s.add} disabled={draft.contacts.length >= 30} onClick={() => patch({ contacts: [...draft.contacts, { name: '', phone: '', email: '' }] })}><Plus size={16} aria-hidden="true" />إضافة جهة اتصال</button>
        </section>
        <section className={s.card} aria-labelledby={`${formId}-account`}>
          <h3 id={`${formId}-account`}><WalletCards size={18} aria-hidden="true" />بيانات الحساب</h3>
          <div className={s.grid}>
            <div className={s.full}>{text('number', 'رقم المورد', { max: 80, dir: 'ltr' })}</div>
            <div className={s.full}><label className={s.field}><span>العملة</span><input dir="ltr" maxLength={3} value={draft.currency} onChange={event => patch({ currency: event.target.value.toUpperCase() })} /></label></div>
            <label className={s.field}><span>أرصدة افتتاحية</span><input type="number" step=".01" disabled={!owner} value={Number.isFinite(draft.openingBalance) ? draft.openingBalance : ''} onChange={event => patch({ openingBalance: event.target.valueAsNumber })} /></label>
            <label className={s.field}><span>تاريخ رصيد الافتتاحي</span><input type="date" disabled={!owner} value={draft.openingDate} onChange={event => patch({ openingDate: event.target.value })} /></label>
            <p className={`${s.hint} ${s.full}`}>{owner ? 'الرصيد الموجب مستحق للمورد والسالب رصيد متاح لدى المورد ويثبت بقيد افتتاحي' : 'الرصيد الافتتاحي يحدده مالك العلامة'}</p>
            <div className={s.full}>{text('email', 'البريد الإلكتروني', { type: 'email', dir: 'ltr' })}</div>
            <label className={`${s.field} ${s.full}`}><span>الملاحظات</span><textarea rows={4} maxLength={5000} value={draft.note} onChange={event => patch({ note: event.target.value })} /></label>
          </div>
        </section>
      </fieldset>
    </form>
  </Modal>;
}
