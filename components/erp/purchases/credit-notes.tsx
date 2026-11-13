'use client';
import { useRef, useState } from 'react';
import Link from '@/components/erp/navigation';
import { Modal } from '@/components/dashboard/ui/modal';
import { withBranchScope } from '@/components/erp/branches/context';
import { useSystemFormat } from '@/components/erp/settings/preferences';
import { DocumentTemplatePrint } from '@/components/erp/templates/document-template-print';
import { defaultDocumentTemplate, type DocumentTemplate } from '@/lib/erp/templates';
import { actPurchaseCreditNote, refreshPurchaseCreditNotes } from '@/app/actions/erp-purchase-credit-notes';
import { getErpAccountingDocument } from '@/app/actions/erp-accounting';
import type { LedgerDocument } from '@/lib/finance/ledger';
import { purchaseCreditInput, purchaseCreditTotals, type PurchaseCreditInput, type PurchaseCreditNote, type PurchaseCreditCommand } from '@/lib/erp/purchase-credit-notes';
import type { PurchaseSnapshot } from '@/lib/erp/purchases';
import { displayRecordNumber } from '@/lib/erp/settings-numbering';
import s from '@/components/erp/installments/installments.module.css';

const statuses = { draft: 'مسودة', posted: 'مصدر', cancelled: 'ملغى' };
export function PurchaseCreditNotes({ snapshot, templates, invoiceId, initialId }: { snapshot: PurchaseSnapshot; templates: DocumentTemplate[]; invoiceId?: string; initialId?: string }) {
  const display = useSystemFormat(), lock = useRef(false), retry = useRef<{ body: string; request: string } | null>(null);
  const [rows, setRows] = useState<PurchaseCreditNote[]>(snapshot.creditNotes ?? []), [query, setQuery] = useState('');
  const [form, setForm] = useState<PurchaseCreditInput | null>(null), [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [payment, setPayment] = useState<PurchaseCreditNote | null>(null), [account, setAccount] = useState(''), [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }));
  const [confirmation, setConfirmation] = useState<PurchaseCreditCommand | null>(null), [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [journal, setJournal] = useState<LedgerDocument | null>(null);
  const note = rows.find(row => row.id === selected), invoices = snapshot.invoices.filter(row => row.kind === 'purchase');
  const supplier = (id: string) => snapshot.suppliers.find(row => row.id === id)?.name ?? '—';
  const template = templates.find(row => row.kind === 'purchase' && row.layout.active && row.layout.isDefault) ?? defaultDocumentTemplate('purchase');
  const totals = form ? purchaseCreditTotals(form) : null;
  function create() {
    setError(''); setForm({ id: crypto.randomUUID(), revision: 0, invoiceId: invoiceId ?? '', date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }), description: '', amount: 0, discount: 0, taxRate: 15, expenseAccountId: '' });
  }
  function edit(row: PurchaseCreditNote) {
    const p = row.payload;
    setForm({ id: row.id, revision: row.revision, invoiceId: row.source_document_id, date: p.date, description: p.description, amount: p.amount, discount: p.discount, taxRate: p.taxRate, expenseAccountId: p.expenseAccountId });
  }
  async function showJournal(documentId: string) {
    if (pending) return;
    setPending(true); setError('');
    try { const result = await getErpAccountingDocument(snapshot.slug, documentId); if (result.ok) setJournal(result.data); else setError(result.message); }
    catch { setError('تعذر تحميل القيد المالي'); }
    finally { setPending(false); }
  }
  async function execute(command: PurchaseCreditCommand) {
    if (lock.current) return; lock.current = true; setPending(true); setError(''); setNotice('');
    const body = JSON.stringify(command), request = retry.current?.body === body ? retry.current.request : crypto.randomUUID();
    retry.current = { body, request };
    try {
      const result = await actPurchaseCreditNote(snapshot.slug, withBranchScope(command, snapshot), request);
      if (!result.ok) { setError(result.message); return; }
      retry.current = null; setForm(null); setPayment(null); setConfirmation(null); setSelected(command.action === 'delete' ? null : result.data.id);
      const refreshed = await refreshPurchaseCreditNotes(snapshot.slug);
      if (refreshed.ok) setRows(refreshed.data); else setError(refreshed.message);
      setNotice('تم حفظ الإشعار وتحديث سجله');
    } catch { setError('تعذر تأكيد العملية أعد المحاولة للتحقق من النتيجة'); }
    finally { setPending(false); lock.current = false; }
  }
  const visible = rows.filter(row => (!invoiceId || row.source_document_id === invoiceId) && `${row.code} ${row.payload.description} ${supplier(row.supplierId)}`.includes(query));
  return <section className={s.panel} aria-label="الإشعارات الدائنة للمشتريات">
    <div className={s.actions}><h2>الإشعارات الدائنة للمشتريات</h2>{snapshot.canCreate && <button type="button" className={s.primary} disabled={pending || !snapshot.settings.allowCreditNotes} onClick={create}>إنشاء إشعار دائن</button>}</div>
    <p>زيادة مالية على فاتورة الشراء تُضاف إلى المستحق للمورد دون تغيير كميات المخزون أو تكلفة أصنافه</p>
    {!snapshot.settings.allowCreditNotes && <p>يمكن تفعيل إنشاء الإشعارات من <Link href="/dashboard/system/purchases/settings">إعدادات المشتريات</Link></p>}
    {error && <p role="alert" className={s.error}>{error}</p>}{notice && <p role="status" className={s.success}>{notice}</p>}
    <label>البحث<input value={query} onChange={event => setQuery(event.target.value)} placeholder="الرقم أو المورد أو الوصف" /></label>
    <div className={s.tableScroll}><table><thead><tr><th>الإشعار</th><th>فاتورة الشراء</th><th>المورد</th><th>الحالة</th><th>المبلغ</th><th>المتبقي</th><th>الإجراء</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td>{row.code}</td><td><Link href={`/dashboard/system/purchases/invoices/${row.source_document_id}`}>{row.sourceNumber}</Link></td><td>{supplier(row.supplierId)}</td><td>{statuses[row.status]}</td><td>{display.money(row.payload.total)}</td><td>{display.money(row.outstanding)}</td><td><button type="button" onClick={() => setSelected(row.id)}>عرض</button></td></tr>)}</tbody></table></div>
    {!visible.length && <p>لا توجد إشعارات مطابقة</p>}
    {note && <section className={s.panel}><h3>{note.code} — {statuses[note.status]}</h3><p>{note.payload.description}</p><p>{display.date(note.payload.date)} — {supplier(note.supplierId)}</p><p>الصافي {display.money(note.payload.net)} — الضريبة {display.money(note.payload.tax)} — الإجمالي {display.money(note.payload.total)} — المستحق {display.money(note.outstanding)}</p>
      <div className={s.actions}>
        {snapshot.canUpdate && note.status === 'draft' && <button type="button" disabled={pending} onClick={() => edit(note)}>تعديل</button>}
        {snapshot.canApprove && note.status === 'draft' && <button type="button" disabled={pending || !snapshot.settings.allowCreditNotes} onClick={() => setConfirmation({ action: 'post', payload: { id: note.id, revision: note.revision, expectedTotal: note.payload.total } })}>إصدار الإشعار</button>}
        {snapshot.canApprove && note.status === 'posted' && <><button type="button" disabled={pending || note.outstanding <= 0} onClick={() => { setPayment(note); setAccount(''); setAmount(note.outstanding); }}>إضافة دفعة</button><button type="button" disabled={pending} onClick={() => setConfirmation({ action: 'draft', payload: { id: note.id, revision: note.revision } })}>تحويل إلى مسودة</button></>}
        {snapshot.canDelete && note.status === 'draft' && <><button type="button" disabled={pending} onClick={() => setConfirmation({ action: 'cancel', payload: { id: note.id, revision: note.revision } })}>إلغاء الإشعار</button>{!note.history.length && <button type="button" disabled={pending} onClick={() => setConfirmation({ action: 'delete', payload: { id: note.id, revision: note.revision } })}>حذف المسودة</button>}</>}
        <DocumentTemplatePrint template={template} slug={snapshot.slug} values={{ العلامة: snapshot.brand, العنوان: 'إشعار دائن مشتريات', رقم_المستند: note.code, رقم_الفاتورة: note.sourceNumber, العميل: supplier(note.supplierId), التاريخ: note.payload.date, المبلغ: note.payload.total, الضريبة: note.payload.tax, المتبقي: note.outstanding, الوصف: note.payload.description }} table={{ head: ['الوصف', 'القيمة', 'الخصم', 'الضريبة', 'الإجمالي'], rows: [[note.payload.description, String(note.payload.amount), String(note.payload.discount), String(note.payload.tax), String(note.payload.total)]] }} />
      </div>
      {!!note.history.length && <><h4>تاريخ القيود المحفوظ</h4><ul>{note.history.map(history => <li key={history.document_id}><button type="button" disabled={pending} onClick={() => void showJournal(history.document_id)}>عرض قيد الإصدار</button>{history.reversal_document_id && <> — <button type="button" disabled={pending} onClick={() => void showJournal(history.reversal_document_id!)}>عرض قيد العكس</button></>}</li>)}</ul></>}
    </section>}
    <Modal open={Boolean(journal)} title="القيد المالي" onClose={() => setJournal(null)} panelClassName={s.dialog}>{journal && <><p>{journal.document.note}</p><div className={s.tableScroll}><table><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>{journal.journal.map(line => <tr key={line.id}><td>{line.accountCode} — {line.accountName}</td><td>{display.money(line.debit)}</td><td>{display.money(line.credit)}</td></tr>)}</tbody></table></div></>}</Modal>
    <Modal open={form !== null} title={form?.revision ? 'تعديل الإشعار الدائن' : 'إشعار دائن جديد'} onClose={() => { if (!pending) setForm(null); }} panelClassName={`${s.dialog} w-[min(800px,96vw)]`}>
      {form && <form className={s.form} onSubmit={event => { event.preventDefault(); const parsed = purchaseCreditInput.safeParse(form); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'راجع بيانات الإشعار'); return; } void execute({ action: 'save', payload: parsed.data }); }}>
        {error && <p role="alert" className={s.error}>{error}</p>}<fieldset disabled={pending} className={s.formGrid}>
          <label>فاتورة الشراء<select required value={form.invoiceId} disabled={form.revision > 0 || Boolean(invoiceId)} onChange={event => setForm({ ...form, invoiceId: event.target.value })}><option value="">اختر الفاتورة</option>{invoices.map(row => <option key={row.id} value={row.id}>{displayRecordNumber(row)} — {supplier(row.party_id ?? '')}</option>)}</select></label>
          <label>التاريخ<input type="date" required value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
          <label>الوصف أو السبب<textarea required maxLength={2000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          <label>القيمة بالريال قبل الضريبة<input required type="number" min="0.01" max="1000000000" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.valueAsNumber })} /></label>
          <label>الخصم بالريال<input required type="number" min="0" max={form.amount} step="0.01" value={form.discount} onChange={event => setForm({ ...form, discount: event.target.valueAsNumber })} /></label>
          <label>الضريبة %<input required type="number" min="0" max="100" step="0.001" value={form.taxRate} onChange={event => setForm({ ...form, taxRate: event.target.valueAsNumber })} /></label>
          <label>حساب المصروف<select required value={form.expenseAccountId} onChange={event => setForm({ ...form, expenseAccountId: event.target.value })}><option value="">اختر الحساب</option>{snapshot.finance.accounts.filter(row => row.active && row.kind === 'expense').map(row => <option value={row.id} key={row.id}>{row.name}</option>)}</select></label>
        </fieldset><p>الإجمالي {totals && Number.isFinite(totals.total) ? display.money(totals.total) : '—'}</p><button className={s.primary} disabled={pending}>حفظ المسودة</button>
      </form>}
    </Modal>
    <Modal open={Boolean(payment)} title="دفع الإشعار الدائن" onClose={() => { if (!pending) setPayment(null); }} panelClassName={s.dialog}>
      {payment && <form className={s.form} onSubmit={event => { event.preventDefault(); void execute({ action: 'payment', payload: { id: payment.id, revision: payment.revision, accountId: account, amount, date: paymentDate } }); }}>
        {error && <p role="alert" className={s.error}>{error}</p>}<fieldset disabled={pending}><label>الخزينة أو الحساب البنكي<select required value={account} onChange={event => setAccount(event.target.value)}><option value="">اختر الحساب</option>{snapshot.finance.accounts.filter(row => row.active && ['cash', 'bank'].includes(row.kind)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>المبلغ<input required type="number" min="0.01" max={payment.outstanding} step="0.01" value={amount} onChange={event => setAmount(event.target.valueAsNumber)} /></label><label>التاريخ<input required type="date" value={paymentDate} onChange={event => setPaymentDate(event.target.value)} /></label></fieldset><button className={s.primary} disabled={pending}>تسجيل الدفع</button>
      </form>}
    </Modal>
    <Modal open={Boolean(confirmation)} title="تأكيد الإجراء" onClose={() => { if (!pending) setConfirmation(null); }}><p>{confirmation?.action === 'draft' ? 'سيُنشأ قيد عكسي مع حفظ قيد الإصدار السابق وتُعاد المسودة للتعديل ولا يمكن ذلك بعد تسجيل دفعة أو معاملة لاحقة' : confirmation?.action === 'post' ? 'سيُضاف المبلغ إلى المستحق للمورد مع إنشاء قيد مالي متوازن دون حركة مخزون' : 'تأكيد إلغاء أو حذف المسودة المحددة'}</p>{error && <p role="alert" className={s.error}>{error}</p>}<div className={s.actions}><button type="button" disabled={pending} onClick={() => confirmation && void execute(confirmation)}>تأكيد</button><button type="button" disabled={pending} onClick={() => setConfirmation(null)}>تراجع</button></div></Modal>
  </section>;
}
