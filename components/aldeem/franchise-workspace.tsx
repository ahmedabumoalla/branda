'use client';
import { useRef, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { readAldeemFranchise, saveAldeemFranchise, settleAldeemFranchise } from '@/app/actions/aldeem-franchise';
import { FRANCHISE_SECTIONS, type FranchiseInput, type FranchiseOption, type FranchiseRecord, type FranchiseRegister, type FranchiseStatement } from '@/lib/aldeem/franchise';
import s from './franchise-workspace.module.css';
import { useAldeemAutoLoad } from './use-auto-load';

export { FRANCHISE_SECTIONS } from '@/lib/aldeem/franchise';
const money = (value: number) => new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(value);
function draft(kind: FranchiseInput['kind'], row?: FranchiseRecord): FranchiseInput {
  return { id: row?.id ?? crypto.randomUUID(), revision: row?.revision ?? 0, requestId: crypto.randomUUID(), kind, name: row?.name ?? '', active: row?.active ?? true, partnerId: row?.partner_id ?? null, partyId: row?.party_id ?? null, productId: row?.product_id ?? null, payload: row?.payload ?? { reference: '', territory: '', from: '', to: '', royalty: 0, price: 0, note: '' } };
}

export function AldeemFranchiseWorkspace({ section }: { section: string }) {
  const config = FRANCHISE_SECTIONS[section];
  const [register, setRegister] = useState<FranchiseRegister | null>(null), [query, setQuery] = useState(''), [applied, setApplied] = useState(''), [offset, setOffset] = useState(0);
  const [editor, setEditor] = useState<FranchiseInput | null>(null), [record, setRecord] = useState<FranchiseRecord | undefined>();
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [partners, setPartners] = useState<FranchiseOption[]>([]), [partnerId, setPartnerId] = useState(''), [statement, setStatement] = useState<FranchiseStatement | null>(null);
  const [payment, setPayment] = useState<{ documentId: string; number: number; remaining: number; amount: string; accountId: string; note: string } | null>(null);
  const locked = useRef(false), reading = useRef(false), request = useRef<{ body: string; id: string } | null>(null);
  useAldeemAutoLoad(() => config.kind === 'settlement' ? searchPartners() : load(), !!config, section);
  if (!config) return null;
  const paymentMode = config.kind === 'settlement';

  async function load(nextOffset = 0, nextQuery = query, target = partnerId) {
    if (locked.current || reading.current) return;
    reading.current = true;
    setBusy(true); setError('');
    try {
      const response = await readAldeemFranchise({ mode: config.kind === 'settlement' ? 'statement' : config.kind, query: nextQuery, offset: nextOffset, partnerId: config.kind === 'settlement' ? target || null : null });
      if (!response.ok) { setError(response.message); return; }
      if (config.kind === 'settlement') setStatement(response.data as FranchiseStatement); else setRegister(response.data as FranchiseRegister);
      setApplied(nextQuery); setOffset(nextOffset);
    } catch { setError('تعذر الاتصال حاول مجددًا'); } finally { reading.current = false; setBusy(false); }
  }
  async function searchPartners() {
    if (locked.current || reading.current) return;
    reading.current = true; setBusy(true); setError('');
    try { const result = await readAldeemFranchise({ mode: 'partners', query }); if (result.ok) setPartners(result.data as FranchiseOption[]); else setError(result.message); }
    catch { setError('تعذر البحث حاول مجددًا'); }
    finally { reading.current = false; setBusy(false); }
  }
  async function save(value: FranchiseInput) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    const body = JSON.stringify({ ...value, requestId: undefined });
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    try {
      const response = await saveAldeemFranchise({ ...value, requestId: request.current.id });
      if (!response.ok) { setError(response.message); return; }
      request.current = null; setEditor(null); setRecord(undefined); setMessage('تم حفظ السجل في الحساب');
      locked.current = false; await load(0, query);
    } catch { setError('تعذر الاتصال أعد المحاولة بنفس البيانات'); } finally { locked.current = false; setBusy(false); }
  }
  async function pay() {
    if (!payment || !statement || locked.current) return;
    locked.current = true; setBusy(true); setError(''); setMessage('');
    const payload = { partnerId: statement.partner.id, documentId: payment.documentId, accountId: payment.accountId, amount: Number(payment.amount), note: payment.note };
    const body = JSON.stringify(payload);
    if (request.current?.body !== body) request.current = { body, id: crypto.randomUUID() };
    try {
      const response = await settleAldeemFranchise({ ...payload, requestId: request.current.id });
      if (!response.ok) { setError(response.message); return; }
      request.current = null; setPayment(null); setMessage(`تم تسجيل الدفعة رقم ${response.data.number} في حساب العميل`);
      locked.current = false; await load(offset, applied, statement.partner.id);
    } catch { setError('تعذر الاتصال أعد المحاولة بنفس البيانات'); } finally { locked.current = false; setBusy(false); }
  }
  return <section className={s.workspace} dir="rtl">
    <header className={s.header}><div><h2>{config.title}</h2><p>{paymentMode ? 'فواتير الشريك ودفعاته من حساب العميل' : config.kind === 'product' ? 'ربط منتجات المنيو بالشريك وتحديد سعر التوريد المتفق عليه' : config.kind === 'agreement' ? 'الاتفاقيات والمناطق ومدد السريان والنسب المتفق عليها' : 'ربط كل شريك بحساب العميل المعتمد في النظام'}</p></div>{!paymentMode && <button className={s.primary} disabled={busy || !!editor} onClick={() => { setRecord(undefined); setEditor(draft(config.kind as FranchiseInput['kind'])); setError(''); setMessage(''); }}><Plus size={17}/>إضافة سجل</button>}</header>
    {error && <p role="alert" className={s.error}>{error}</p>}{message && <p role="status" className={s.success}>{message}</p>}
    {editor ? <Editor initial={editor} record={record} busy={busy} onSave={save} onClose={() => { setEditor(null); setRecord(undefined); }}/>
      : <>
        <form className={s.filters} onSubmit={event => { event.preventDefault(); void (paymentMode ? searchPartners() : load()); }}>
          <label>{paymentMode ? 'بحث عن شريك' : 'الاسم أو اسم الشريك'}<input value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="اكتب اسم البحث"/></label><button disabled={busy}><Search size={16}/>{error ? 'إعادة المحاولة' : paymentMode ? 'بحث عن الشريك' : 'بحث وتحديث'}</button>
          {paymentMode && <><label>الشريك<select disabled={busy} value={partnerId} onChange={event => { const id = event.target.value; setPartnerId(id); setStatement(null); setPayment(null); if (id) void load(0, query, id); }}><option value="">اختر الشريك</option>{partners.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className={s.primary} type="button" disabled={busy || !partnerId} onClick={() => void load()}><RefreshCw size={16}/>تحديث الحساب</button></>}
        </form>
        {!paymentMode && register && <><div className={s.table}><table><thead><tr><th>الاسم</th><th>{config.kind === 'partner' ? 'حساب العميل' : 'الشريك'}</th>{config.kind === 'product' && <><th>منتج المنيو</th><th>سعر التوريد</th></>}{config.kind === 'agreement' && <><th>المرجع</th><th>السريان</th><th>النسبة</th></>}<th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{register.rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{config.kind === 'partner' ? row.party_name : row.partner_name}</td>{config.kind === 'product' && <><td>{row.product_name}</td><td>{money(row.payload.price)}</td></>}{config.kind === 'agreement' && <><td>{row.payload.reference}</td><td>{row.payload.from} — {row.payload.to}</td><td>{row.payload.royalty}%</td></>}<td>{row.active ? 'نشط' : 'غير نشط'}</td><td><button disabled={busy} onClick={() => { setRecord(row); setEditor(draft(row.kind, row)); }}>عرض وتعديل</button></td></tr>)}</tbody></table>{!register.rows.length && <p className={s.empty}>لا توجد سجلات مطابقة أضف أول سجل من الأعلى</p>}</div><Pager offset={offset} more={register.hasMore} busy={busy} load={value => void load(value, applied)}/></>}
        {paymentMode && statement && <>
          <div className={s.notice}><strong>{statement.partner.name}</strong><span>الدفعات تخص الفواتير المسجلة لهذا العميل</span></div>
          {payment && <form className={s.panel} onSubmit={event => { event.preventDefault(); void pay(); }}><div className={s.header}><h3>تسجيل دفعة للفاتورة #{payment.number}</h3><button type="button" disabled={busy} aria-label="إغلاق تسجيل الدفعة" onClick={() => setPayment(null)}><X size={16}/></button></div><div className={s.grid}><label>المبلغ المستحق<strong>{money(payment.remaining)}</strong></label><label>مبلغ الدفعة<input disabled={busy} required type="number" min="0.01" max={payment.remaining} step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })}/></label><label>حساب التحصيل<select disabled={busy} required value={payment.accountId} onChange={e => setPayment({ ...payment, accountId: e.target.value })}><option value="">اختر الحساب</option>{statement.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>ملاحظات<input disabled={busy} maxLength={800} value={payment.note} onChange={e => setPayment({ ...payment, note: e.target.value })}/></label></div><button className={s.primary} disabled={busy}>تأكيد تسجيل الدفعة</button></form>}
          <div className={s.table}><table><thead><tr><th>الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th><th>الإجراء</th></tr></thead><tbody>{statement.invoices.map(invoice => <tr key={invoice.id}><td>#{invoice.number}</td><td>{new Date(invoice.created_at).toLocaleDateString('ar-SA', { calendar: 'gregory', timeZone: 'Asia/Riyadh' })}</td><td>{money(invoice.total)}</td><td>{money(invoice.outstanding)}</td><td>{invoice.outstanding > 0 ? <button disabled={busy} onClick={() => setPayment({ documentId: invoice.id, number: invoice.number, remaining: invoice.outstanding, amount: String(invoice.outstanding), accountId: '', note: '' })}>تسجيل دفعة</button> : 'مسددة'}</td></tr>)}</tbody></table>{!statement.invoices.length && <p className={s.empty}>لا توجد فواتير مسجلة لهذا الشريك</p>}</div>
          <Pager offset={offset} more={statement.hasMore} busy={busy} load={value => void load(value, applied)}/>
          <section className={s.panel}><h3>آخر حركات الحساب</h3><div className={s.table}><table><thead><tr><th>رقم الحركة</th><th>النوع</th><th>المبلغ</th><th>الملاحظة</th></tr></thead><tbody>{statement.history.map(row => <tr key={row.id}><td>#{row.number}</td><td>{row.kind === 'refund' ? 'مرتجع' : 'دفعة'}</td><td>{money(row.total)}</td><td>{row.note}</td></tr>)}</tbody></table>{!statement.history.length && <p className={s.empty}>لا توجد دفعات أو مرتجعات مسجلة</p>}</div></section>
        </>}
        {!register && !paymentMode && <p className={s.empty} role="status">{busy ? 'جار تحميل السجل' : 'تعذر تحميل السجل يمكنك إعادة المحاولة'}</p>}
      </>}
  </section>;
}

function Pager({ offset, more, busy, load }: { offset: number; more: boolean; busy: boolean; load: (value: number) => void }) { return <div className={s.pager}><button disabled={busy || !offset} onClick={() => load(offset - 30)}>السابق</button><span>الصفحة {Math.floor(offset / 30) + 1}</span><button disabled={busy || !more} onClick={() => load(offset + 30)}>التالي</button></div>; }

function Editor({ initial, record, busy, onSave, onClose }: { initial: FranchiseInput; record?: FranchiseRecord; busy: boolean; onSave: (value: FranchiseInput) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const set = (change: Partial<FranchiseInput>) => setValue(old => ({ ...old, ...change }));
  const detail = (change: Partial<FranchiseInput['payload']>) => setValue(old => ({ ...old, payload: { ...old.payload, ...change } }));
  return <form className={s.panel} onSubmit={event => { event.preventDefault(); void onSave(value); }}><div className={s.header}><h3>{initial.revision ? 'تعديل السجل' : 'سجل جديد'}</h3><button type="button" disabled={busy} onClick={onClose} aria-label="إغلاق السجل"><X size={17}/></button></div><fieldset disabled={busy} className={s.fields}><div className={s.grid}>
    <label>الاسم<input required minLength={2} maxLength={160} value={value.name} onChange={event => set({ name: event.target.value })}/></label>
    {value.kind === 'partner' ? <Lookup label="حساب العميل المرتبط بالشريك" mode="customers" value={value.partyId} selectedName={record?.party_name} disabled={initial.revision > 0} onSelect={id => set({ partyId: id })}/> : <Lookup label="الشريك" mode="partners" value={value.partnerId} selectedName={record?.partner_name} disabled={initial.revision > 0} onSelect={id => set({ partnerId: id })}/>}
    {value.kind === 'product' && <><Lookup label="منتج المنيو" mode="products" value={value.productId} selectedName={record?.product_name} onSelect={id => set({ productId: id })}/><label>سعر التوريد المتفق عليه<input type="number" required min="0" max="1000000" step="0.01" value={value.payload.price} onChange={event => detail({ price: Number(event.target.value) })}/></label></>}
    {value.kind !== 'product' && <label>المنطقة أو نطاق النشاط<input maxLength={300} value={value.payload.territory} onChange={event => detail({ territory: event.target.value })}/></label>}
    {value.kind === 'agreement' && <><label>رقم الاتفاقية<input required maxLength={100} value={value.payload.reference} onChange={event => detail({ reference: event.target.value })}/></label><label>من تاريخ<input required type="date" value={value.payload.from} max={value.payload.to || undefined} onChange={event => detail({ from: event.target.value })}/></label><label>إلى تاريخ<input required type="date" value={value.payload.to} min={value.payload.from || undefined} onChange={event => detail({ to: event.target.value })}/></label><label>النسبة المتفق عليها %<input required type="number" min="0" max="100" step="0.01" value={value.payload.royalty} onChange={event => detail({ royalty: Number(event.target.value) })}/></label></>}
    <label>الحالة<select value={String(value.active)} onChange={event => set({ active: event.target.value === 'true' })}><option value="true">نشط</option><option value="false">غير نشط</option></select></label><label className={s.wide}>ملاحظات<textarea maxLength={2000} value={value.payload.note} onChange={event => detail({ note: event.target.value })}/></label>
  </div>{value.kind === 'agreement' && <p className={s.hint}>تحفظ شروط الاتفاقية هنا وتُسجّل الاستحقاقات بفواتير وقيود الحساب المعتمدة</p>}<button className={s.primary}>حفظ في الحساب</button></fieldset></form>;
}

function Lookup({ label, mode, value, selectedName, disabled, onSelect }: { label: string; mode: 'customers' | 'partners' | 'products'; value: string | null; selectedName?: string; disabled?: boolean; onSelect: (id: string | null) => void }) {
  const [query, setQuery] = useState(''), [options, setOptions] = useState<FranchiseOption[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function search() { setBusy(true); setError(''); try { const r = await readAldeemFranchise({ mode, query }); if (r.ok) setOptions(r.data as FranchiseOption[]); else setError(r.message); } catch { setError('تعذر البحث'); } finally { setBusy(false); } }
  return <div className={s.lookup}><label>{label}<select required disabled={disabled || busy} value={value ?? ''} onChange={event => onSelect(event.target.value || null)}><option value="">اختر من نتائج البحث</option>{value && !options.some(row => row.id === value) && <option value={value}>{selectedName ?? 'السجل المختار'}</option>}{options.map(row => <option key={row.id} value={row.id}>{row.name}{row.phone ? ` — ${row.phone}` : ''}</option>)}</select></label>{!disabled && <div className={s.lookupSearch}><input aria-label={`بحث ${label}`} value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="الاسم أو رقم الجوال"/><button type="button" disabled={busy} onClick={() => void search()}><Search size={15}/>بحث</button></div>}{error && <span role="alert" className={s.error}>{error}</span>}</div>;
}
