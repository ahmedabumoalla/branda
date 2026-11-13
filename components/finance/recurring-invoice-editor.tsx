"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, Plus, Save } from "lucide-react";
import { saveRecurringInvoiceAction } from "@/app/actions/finance-recurring-invoices";
import { companyInvoiceIssuerAction } from "@/app/actions/finance-company-invoices";
import { recurrencePreview, recurringInvoiceAmounts, recurringInvoiceSchema, type RecurringInvoicePayload, type RecurringInvoiceRecord } from "@/lib/finance/recurring-invoice";
import { newQuote, riyadhDate } from "@/lib/finance/quotation";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { Modal } from "@/components/dashboard/ui/modal";
import { CompanyInvoiceLines } from "./company-invoice-lines";
import { FinanceCustomerForm } from "./finance-customer-form";
import { RecurringInvoiceDocument, recurringInvoicePreview } from "./recurring-invoice-document";
import { CreditNoteTotals } from "./credit-note-document";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

export function newRecurringInvoice(snapshot: FinanceSnapshot): RecurringInvoicePayload {
  const document = newQuote(snapshot).document;
  document.issuer = { name: snapshot.cafe.name, vatNumber: "", address: "" };
  return { name: "", interval: 1, unit: "month", count: 0, firstDate: riyadhDate(), leadDays: 0, paymentTermsDays: 0, showPeriod: false, active: true, document };
}

export function RecurringInvoiceEditor({ snapshot, saved, disabled, onSaved, onCancel, onCreateCustomer }: {
  snapshot: FinanceSnapshot; saved?: RecurringInvoiceRecord; disabled: boolean;
  onSaved: (record: RecurringInvoiceRecord) => void; onCancel: () => void;
  onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [payload, setPayload] = useState<RecurringInvoicePayload>(() => saved?.payload ?? newRecurringInvoice(snapshot));
  const identity = useRef({ id: saved?.id ?? "", revision: saved?.revision ?? 0 });
  const lock = useRef(false), issuerTouched = useRef(!!saved);
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(!saved);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"preview" | "customer" | "cancel" | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const invoice = payload.document.invoice, issuer = payload.document.issuer ?? { name: "", vatNumber: "", address: "" };
  const amounts = recurringInvoiceAmounts(payload), blocked = disabled || busy;
  const cadenceLocked = (saved?.generatedCount ?? 0) > 0;
  let upcoming: ReturnType<typeof recurrencePreview> = [], scheduleError = "";
  try { upcoming = recurrencePreview(payload, saved?.generatedCount ?? 0, 5); }
  catch { scheduleError = "راجع تاريخ البداية والفاصل الزمني للتكرار"; }
  useEffect(() => {
    if (saved) return;
    let active = true;
    void companyInvoiceIssuerAction(snapshot.cafe.slug).then(result => {
      if (active && !issuerTouched.current && result.ok) setPayload(p => ({ ...p, document: { ...p.document, issuer: result.data } }));
    }).catch(() => { /* The issuer fields remain editable when the lookup fails. */ });
    return () => { active = false; };
  }, [saved, snapshot.cafe.slug]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = (next: Partial<RecurringInvoicePayload>) => { setPayload(p => ({ ...p, ...next })); setDirty(true); setError(""); };
  const patchInvoice = (next: Partial<typeof invoice>) => patch({ document: { ...payload.document, invoice: { ...invoice, ...next } } });
  const patchIssuer = (next: Partial<typeof issuer>) => { issuerTouched.current = true; patch({ document: { ...payload.document, issuer: { ...issuer, ...next } } }); };
  const save = async () => {
    if (blocked || lock.current) return;
    setError("");
    const parsed = recurringInvoiceSchema.safeParse(payload);
    if (!parsed.success || scheduleError) { setError("راجع اسم الاشتراك والتواريخ وعدد التكرارات والبنود"); return; }
    if (!invoice.partyId) { setError("اختر العميل الذي ستصدر له الفواتير الدورية"); return; }
    if (!issuer.name.trim() || !/^3[0-9]{13}3$/.test(issuer.vatNumber) || issuer.address.trim().length < 8) { setError("أكمل اسم المنشأة ورقمها الضريبي وعنوانها قبل حفظ الاشتراك"); return; }
    if (amounts.total <= 0 || invoice.lines.some(line => line.quantity <= 0 || (!line.productId && !line.name?.trim()))) { setError("أضف بندًا صالحًا وتأكد من الكميات ومبلغ الفاتورة"); return; }
    if (!identity.current.id) identity.current.id = crypto.randomUUID();
    lock.current = true; setBusy(true);
    try {
      const result = await saveRecurringInvoiceAction({ ...identity.current, payload: parsed.data }, snapshot.cafe.slug);
      if (!result.ok) { setError(result.message); return; }
      identity.current = { id: result.data.id, revision: result.data.revision };
      setDirty(false); onSaved(result.data);
    } catch { setError("تعذر تأكيد الحفظ أعد المحاولة بنفس الاشتراك"); }
    finally { lock.current = false; setBusy(false); }
  };
  const customers = snapshot.parties.filter(p => p.kind === "customer" && p.active);
  return <div className={css.page}>
    <form className={css.page} inert={!!modal} onSubmit={event => { event.preventDefault(); void save(); }}>
      <div className={css.bar}><button type="button" className={styles.secondary} disabled={busy} onClick={() => dirty ? setModal("cancel") : onCancel()}><ArrowRight size={16} aria-hidden="true" />رجوع</button><div className={css.actions}><button type="button" className={styles.secondary} disabled={!!scheduleError || !upcoming.length} onClick={() => setModal("preview")}><Eye size={16} aria-hidden="true" />معاينة الفاتورة القادمة</button><button type="submit" className={styles.primary} disabled={blocked}><Save size={16} aria-hidden="true" />{busy ? "جار الحفظ" : payload.active ? "حفظ وتفعيل الاشتراك" : "حفظ الاشتراك"}</button></div></div>
      {error && <p className={styles.error} role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
      <fieldset disabled={blocked} className={css.page}>
        <div className={css.formColumns}>
          <section className={css.panel}><div className={css.panelHead}><h2>خيارات الإصدار الآلي</h2></div><div className={css.fields}>
            <div className={css.wide}><Field label="اسم الاشتراك"><input required maxLength={160} value={payload.name} onChange={e => patch({ name: e.target.value })} placeholder="مثل توريد القهوة الشهري" /></Field></div>
            <Field label="إصدار فاتورة كل" hint="مثال كل شهر أو كل أسبوعين"><input type="number" min={1} max={365} step={1} required disabled={cadenceLocked} value={payload.interval} onChange={e => patch({ interval: Number(e.target.value) })} /></Field>
            <Field label="وحدة التكرار"><select disabled={cadenceLocked} value={payload.unit} onChange={e => patch({ unit: e.target.value as RecurringInvoicePayload["unit"] })}><option value="day">يوم</option><option value="week">أسبوع</option><option value="month">شهر</option><option value="year">سنة</option></select></Field>
            <Field label="عدد مرات التكرار" hint="الصفر يعني الاستمرار حتى إيقاف الاشتراك"><input type="number" min={0} max={10000} step={1} value={payload.count} onChange={e => patch({ count: Number(e.target.value) })} /></Field>
            <Field label="تاريخ أول فاتورة"><input type="date" min="1900-01-01" required disabled={cadenceLocked} value={payload.firstDate} onChange={e => patch({ firstDate: e.target.value })} /></Field>
            <Field label="إصدار الفاتورة قبل الموعد" hint="عدد الأيام قبل تاريخ الفاتورة الصفر يعني الإنشاء في موعدها"><input type="number" min={0} max={365} step={1} value={payload.leadDays} onChange={e => patch({ leadDays: Number(e.target.value) })} /></Field>
            <Field label="شروط الدفع بالأيام" hint="تضاف إلى تاريخ الفاتورة لتحديد تاريخ الاستحقاق"><input type="number" min={0} max={3650} step={1} value={payload.paymentTermsDays} onChange={e => patch({ paymentTermsDays: Number(e.target.value) })} /></Field>
            {cadenceLocked && <p className={`${css.hint} ${css.wide}`}>تاريخ البداية ودورة التكرار ثابتان بعد إصدار أول فاتورة أنشئ اشتراكًا جديدًا إذا احتجت دورة مختلفة</p>}
            <div className={css.wide}><label className={styles.check}><input type="checkbox" checked={payload.active} onChange={e => patch({ active: e.target.checked })} />نشط</label><p className={css.hint}>الاشتراك النشط يصدر فواتير آجلة تلقائيًا في مواعيدها ويُسجل أثرها المالي والمخزني عند الإصدار</p></div>
            <div className={css.wide}><label className={styles.check}><input type="checkbox" checked={payload.showPeriod} onChange={e => patch({ showPeriod: e.target.checked })} />عرض تاريخ الفترة من وحتى في الفاتورة</label></div>
            <div className={css.wide}><label className={styles.check}><input type="checkbox" checked={false} disabled readOnly />أرسل لي نسخة من الفاتورة المنشأة</label><p className={css.hint}>الإرسال التلقائي بالبريد غير متاح حاليًا ويمكن إرسال الفاتورة بعد إصدارها من صفحة تفاصيلها</p></div>
            <div className={css.wide}><label className={styles.check}><input type="checkbox" checked={false} disabled readOnly />تفعيل الدفع التلقائي لهذه الفاتورة</label><p className={css.hint}>يتطلب بوابة دفع تدعم الخصم الدوري بموافقة العميل هذه الخدمة غير متاحة حاليًا</p></div>
          </div></section>
          <div className={css.page}>
            <section className={css.panel}><div className={css.panelHead}><h2>العميل والفاتورة</h2><span className={css.hint}>ريال سعودي</span></div><div className={css.fields}>
              <div className={`${css.fieldAction} ${css.wide}`}><Field label="العميل"><select required value={invoice.partyId} onChange={e => patchInvoice({ partyId: e.target.value })}><option value="">اختر العميل</option>{invoice.partyId && !customers.some(p => p.id === invoice.partyId) && <option value={invoice.partyId}>{saved?.customerName || "العميل المحفوظ"}</option>}{customers.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field><button type="button" className={styles.secondary} onClick={() => setModal("customer")}><Plus size={16} aria-hidden="true" />جديد</button></div>
              <Field label="قالب الفاتورة"><select value={payload.document.template} onChange={e => patch({ document: { ...payload.document, template: e.target.value as "standard" | "thermal" } })}><option value="standard">التصميم القياسي</option><option value="thermal">التصميم الحراري</option></select></Field>
              <Field label="طريقة التسليم"><select value="print" disabled><option value="print">حفظ الفاتورة للطباعة</option></select></Field>
              <div className={css.wide}><Field label="المستودع"><select required value={invoice.warehouseId} onChange={e => patchInvoice({ warehouseId: e.target.value })}><option value="">اختر المستودع</option>{snapshot.warehouses.filter(w => w.active || w.id === invoice.warehouseId).map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></Field></div>
            </div></section>
            <section className={css.panel}><div className={css.panelHead}><h2>بيانات المنشأة في الفاتورة</h2></div><div className={css.fields}>
              <Field label="اسم المنشأة"><input required maxLength={160} value={issuer.name} onChange={e => patchIssuer({ name: e.target.value })} /></Field>
              <Field label="الرقم الضريبي"><input required inputMode="numeric" pattern="3[0-9]{13}3" maxLength={15} value={issuer.vatNumber} onChange={e => patchIssuer({ vatNumber: e.target.value })} /></Field>
              <div className={css.wide}><Field label="عنوان المنشأة"><textarea required minLength={8} maxLength={500} rows={3} value={issuer.address} onChange={e => patchIssuer({ address: e.target.value })} /></Field></div>
            </div></section>
          </div>
        </div>
        <section className={css.panel}><div className={css.panelHead}><h2>بنود الفاتورة</h2><span className={css.hint}>ريال سعودي</span></div><CompanyInvoiceLines lines={invoice.lines} products={snapshot.products} vatRate={invoice.vatRate ?? 0} disabled={blocked} amounts={amounts.rows} onChange={lines => patchInvoice({ lines: lines.map(line => ({ ...line, name: line.name || snapshot.products.find(p => p.id === line.productId)?.name })) })} allowFreeItems /><div className={css.fields}>
          <Field label="خصم إجمالي الفاتورة"><input type="number" min={0} step="0.01" max={invoice.discountKind === "percent" ? 100 : amounts.subtotal} value={invoice.discountValue} onChange={e => patchInvoice({ discountValue: Number(e.target.value), discountEnabled: true })} /></Field>
          <Field label="نوع الخصم"><select value={invoice.discountKind} onChange={e => patchInvoice({ discountKind: e.target.value as "amount" | "percent", discountValue: 0, discountEnabled: true })}><option value="amount">مبلغ ثابت</option><option value="percent">نسبة مئوية</option></select></Field>
          <Field label="نسبة الضريبة الافتراضية"><input type="number" min={0} max={100} step="0.01" value={invoice.vatRate ?? 0} onChange={e => patchInvoice({ vatRate: Number(e.target.value) })} /></Field>
          <Field label="الأسعار"><select value={invoice.taxInclusive ? "inclusive" : "exclusive"} onChange={e => patchInvoice({ taxInclusive: e.target.value === "inclusive" })}><option value="inclusive">شاملة الضريبة</option><option value="exclusive">غير شاملة الضريبة</option></select></Field>
          <div className={css.wide}><CreditNoteTotals {...amounts} /></div>
        </div></section>
        <section className={css.panel}><div className={css.panelHead}><h2>المواعيد القادمة</h2><span className={css.hint}>بتوقيت الرياض</span></div>{scheduleError ? <p className={styles.error}>{scheduleError}</p> : <div className={css.tableWrap} role="region" tabIndex={0} aria-label="جدول التكرار"><table className={css.table}><thead><tr><th scope="col">الفاتورة</th><th scope="col">تاريخ الفاتورة</th><th scope="col">موعد الإنشاء</th><th scope="col">تاريخ الاستحقاق</th></tr></thead><tbody>{upcoming.map(date => <tr key={date.index}><td>{date.index + 1}</td><td>{date.date}</td><td>{date.issueDate}</td><td>{date.dueDate}</td></tr>)}</tbody></table>{!upcoming.length && <p className={css.hint}>اكتمل عدد الفواتير المحدد</p>}</div>}</section>
        <section className={css.panel}><div className={css.panelHead}><h2>الملاحظات والشروط</h2></div><div className={css.fields}><div className={css.wide}><Field label="الملاحظات والشروط التي تظهر في كل فاتورة"><textarea rows={4} maxLength={500} value={invoice.note} onChange={e => patchInvoice({ note: e.target.value })} /></Field></div></div></section>
      </fieldset>
    </form>
    <Modal open={modal === "preview"} title="معاينة الفاتورة القادمة" onClose={() => setModal(null)}><div className={css.previewBody}>{!scheduleError && upcoming.length > 0 && <RecurringInvoiceDocument model={recurringInvoicePreview(payload, snapshot, saved ? { ...saved, customerName: snapshot.parties.find(p => p.id === invoice.partyId)?.name || (invoice.partyId === saved.payload.document.invoice.partyId ? saved.customerName : "لم يُحدد العميل"), payload, upcoming } : undefined, false)} />}</div></Modal>
    <Modal open={modal === "customer"} title="إضافة عميل" onClose={() => setModal(null)}><FinanceCustomerForm pending={busy} error="" values={{ kind: "customer" }} onSubmit={async (_operation, data) => onCreateCustomer(data)} onSaved={() => setModal(null)} onCancel={() => setModal(null)} /></Modal>
    <Modal open={modal === "cancel"} title="مغادرة دون حفظ" onClose={() => setModal(null)} panelClassName="w-full max-w-lg overflow-hidden rounded-2xl bg-white"><div className={css.confirm}><p>لديك تعديلات لم تُحفظ</p><div className={css.actions}><button className={styles.primary} onClick={() => setModal(null)}>متابعة التعديل</button><button className={styles.secondary} onClick={onCancel}>تجاهل التعديلات</button></div></div></Modal>
  </div>;
}
