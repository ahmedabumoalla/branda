"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Save, Plus, ArrowRight, Printer } from "lucide-react";
import { saveCreditNoteAction, transitionCreditNoteAction } from "@/app/actions/finance-credit-notes";
import { creditNoteAmounts, creditNotePayloadSchema, newCreditNote, type CreditNotePayload, type CreditNoteRecord } from "@/lib/finance/credit-note";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { Modal } from "@/components/dashboard/ui/modal";
import { CompanyInvoiceLines } from "./company-invoice-lines";
import { FinanceCustomerForm } from "./finance-customer-form";
import { CreditNoteDocument, CreditNoteTotals, creditNotePreview } from "./credit-note-document";
import { Field } from "./finance-ui";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

export function CreditNoteEditor({ snapshot, saved, copy, disabled, onSaved, onCancel, onCreateCustomer }: {
  snapshot: FinanceSnapshot; saved?: CreditNoteRecord; copy?: boolean; disabled: boolean;
  onSaved: (record: CreditNoteRecord, print: boolean) => void; onCancel: () => void;
  onCreateCustomer: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [payload, setPayload] = useState<CreditNotePayload>(() => saved ? { ...saved.payload, ...(copy ? { date: newCreditNote(snapshot).date, issueDate: newCreditNote(snapshot).issueDate } : {}) } : newCreditNote(snapshot));
  const identity = useRef({ id: copy ? "" : saved?.id ?? "", revision: copy ? 0 : saved?.revision ?? 0 });
  const [current, setCurrent] = useState(copy ? undefined : saved);
  const requestId = useRef("");
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(!saved || !!copy);
  const [modal, setModal] = useState<"preview" | "customer" | "issue" | "cancel" | null>(null);
  const [print, setPrint] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const amounts = creditNoteAmounts(payload);
  const blocked = disabled || busy || current?.status === "issued";
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = (next: Partial<CreditNotePayload>) => { setPayload(p => ({ ...p, ...next })); setDirty(true); setError(""); };
  const store = async (issue: boolean) => {
    if (disabled || locked.current) return;
    if (!creditNotePayloadSchema.safeParse(payload).success) { setError("راجع التواريخ والكميات والأسعار والخصومات قبل الحفظ"); return; }
    if (issue && (!payload.partyId || !payload.reason.trim() || payload.lines.some(l => !l.productId) || amounts.total <= 0 || (payload.stockRequired && !payload.warehouseId))) {
      setModal(null); setError("اختر العميل والبنود وحدد سبب الإشعار والمستودع عند استلام بضاعة وتأكد أن الإجمالي أكبر من صفر"); return;
    }
    locked.current = true; setBusy(true); setError("");
    try {
      let record = current;
      if (!record || dirty) {
        if (!identity.current.id) identity.current.id = crypto.randomUUID();
        const result = await saveCreditNoteAction({ ...identity.current, payload }, snapshot.cafe.slug);
        if (!result.ok) { setError(result.message); setModal(null); return; }
        record = result.data; identity.current = { id: record.id, revision: record.revision };
        setCurrent(record); setPayload(record.payload); setDirty(false); requestId.current = "";
      }
      if (issue) {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        const result = await transitionCreditNoteAction({ id: record.id, revision: record.revision, operation: "issue", requestId: requestId.current }, snapshot.cafe.slug);
        if (!result.ok) { setError(result.message); setModal(null); return; }
        record = result.data; setCurrent(record);
      }
      setModal(null); onSaved(record, issue && print);
    } catch { setError("تعذر تأكيد الحفظ أعد المحاولة بنفس الإشعار لتجنب التكرار"); setModal(null); }
    finally { locked.current = false; setBusy(false); }
  };
  const askIssue = (withPrint: boolean) => { if (blocked) return; setPrint(withPrint); setModal("issue"); };
  const preview = creditNotePreview(payload, snapshot, dirty ? undefined : current);
  const customerOptions = snapshot.parties.filter(p => p.kind === "customer" && p.active);
  const sourceOptions = snapshot.documents.filter(d => d.kind === "sale" && d.party_id === payload.partyId);
  return <div className={css.page}>
    <form onSubmit={e => { e.preventDefault(); askIssue(false); }} inert={!!modal}>
      <div className={css.bar}><button type="button" className={styles.secondary} disabled={busy} onClick={() => dirty ? setModal("cancel") : onCancel()}><ArrowRight size={16} aria-hidden="true" />رجوع</button><div className={css.actions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => setModal("preview")}><Eye size={16} aria-hidden="true" />معاينة</button>
        <button type="button" className={styles.secondary} disabled={blocked} onClick={() => void store(false)}><Save size={16} aria-hidden="true" />حفظ كمسودة</button>
        <button type="submit" className={styles.primary} disabled={blocked}>حفظ وإصدار</button>
        <button type="button" className={styles.secondary} disabled={blocked} onClick={() => askIssue(true)}><Printer size={16} aria-hidden="true" />حفظ وطباعة</button>
      </div></div>
      {error && <p className={styles.error} ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
      {busy && <p className={styles.notice} role="status">جار حفظ الإشعار</p>}
      <fieldset disabled={blocked} className={css.page} style={{ marginTop: 20 }}>
        <div className={css.formColumns}>
          <section className={css.panel}><div className={css.panelHead}><h2>العميل والاستلام</h2></div><div className={css.fields}>
            <div className={`${css.fieldAction} ${css.wide}`}><Field label="العميل"><select value={payload.partyId} onChange={e => patch({ partyId: e.target.value, sourceInvoiceId: null })}><option value="">اختر العميل</option>{!customerOptions.some(p => p.id === payload.partyId) && payload.partyId && <option value={payload.partyId}>{current?.customerName || saved?.customerName}</option>}{customerOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><button type="button" className={styles.secondary} onClick={() => setModal("customer")}><Plus size={16} aria-hidden="true" />عميل جديد</button></div>
            <Field label="طريقة التسليم"><select value="print" onChange={() => {}}><option value="print">طباعة</option></select></Field>
            <Field label="قالب المستند"><select value={payload.template} onChange={e => patch({ template: e.target.value as CreditNotePayload["template"] })}><option value="standard">قياسي</option><option value="thermal">حراري</option></select></Field>
            <Field label="الفاتورة الأصلية" hint="اختياري عند وجود فاتورة سابقة للعميل"><select value={payload.sourceInvoiceId ?? ""} onChange={e => patch({ sourceInvoiceId: e.target.value || null })}><option value="">إشعار مستقل</option>{payload.sourceInvoiceId && !sourceOptions.some(d => d.id === payload.sourceInvoiceId) && <option value={payload.sourceInvoiceId}>الفاتورة المرتبطة #{saved?.sourceNumber}</option>}{sourceOptions.map(d => <option key={d.id} value={d.id}>#{d.number}</option>)}</select></Field>
            <Field label="حركة المخزون"><select value={payload.stockRequired ? "yes" : "no"} onChange={e => patch({ stockRequired: e.target.value === "yes" })}><option value="no">تسوية مالية دون استلام بضاعة</option><option value="yes">استلام بضاعة مرتجعة</option></select></Field>
            {payload.stockRequired && <Field label="مستودع الاستلام"><select value={payload.warehouseId} onChange={e => patch({ warehouseId: e.target.value })}><option value="">اختر المستودع</option>{snapshot.warehouses.filter(w => w.active).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>}
          </div></section>
          <section className={css.panel}><div className={css.panelHead}><h2>بيانات الإشعار</h2><span className={css.badge}>مسودة</span></div><div className={css.fields}>
            <Field label="رقم الإشعار الدائن"><input readOnly value={current?.number ? current.displayNumber || String(current.number).padStart(6, "0") : "يُخصص تلقائيًا عند الحفظ"} /></Field>
            <Field label="تاريخ الإشعار"><input type="date" required value={payload.date} onChange={e => patch({ date: e.target.value })} /></Field>
            <Field label="تاريخ الإصدار"><input type="date" required value={payload.issueDate} onChange={e => patch({ issueDate: e.target.value })} /></Field>
            <Field label="مسؤول المبيعات"><select value={payload.salespersonId ?? ""} onChange={e => patch({ salespersonId: e.target.value || null })}><option value="">المستخدم الحالي</option>{snapshot.staff.filter(s => s.active).map(s => <option value={s.user_id} key={s.user_id}>{s.name}</option>)}</select></Field>
            <div className={css.wide}><Field label="سبب الإشعار" hint="يوضح سبب إضافة الرصيد إلى حساب العميل"><textarea maxLength={500} rows={3} value={payload.reason} onChange={e => patch({ reason: e.target.value })} /></Field></div>
          </div></section>
        </div>
        <section className={css.panel}><div className={css.panelHead}><h2>بنود الإشعار</h2><span className={css.hint}>ر س</span></div><CompanyInvoiceLines lines={payload.lines} products={snapshot.products} vatRate={payload.vatRate} disabled={blocked} amounts={amounts.rows} onChange={lines => patch({ lines: lines.map(l => ({ key: l.key, productId: l.productId, quantity: l.quantity, price: l.price ?? 0, description: l.description, discount: l.discount, discountKind: l.discountKind, vatRate: l.vatRate })) })} /><div className={css.fields}>
          <Field label="خصم إضافي"><input type="number" min={0} step="0.01" max={payload.discountKind === "percent" ? 100 : amounts.subtotal} value={payload.discountValue} onChange={e => patch({ discountValue: Number(e.target.value) })} /></Field>
          <Field label="نوع الخصم"><select value={payload.discountKind} onChange={e => patch({ discountKind: e.target.value as "amount" | "percent", discountValue: 0 })}><option value="amount">مبلغ ثابت</option><option value="percent">نسبة مئوية</option></select></Field>
          <Field label="نسبة الضريبة الافتراضية"><input type="number" min={0} max={100} step="0.01" value={payload.vatRate} onChange={e => patch({ vatRate: Number(e.target.value) })} /></Field>
          <Field label="الأسعار"><select value={payload.taxInclusive ? "inclusive" : "exclusive"} onChange={e => patch({ taxInclusive: e.target.value === "inclusive" })}><option value="inclusive">شاملة الضريبة</option><option value="exclusive">غير شاملة الضريبة</option></select></Field>
          <div className={css.wide}><CreditNoteTotals {...amounts} /></div>
        </div></section>
        <section className={css.panel}><div className={css.panelHead}><h2>الملاحظات والشروط</h2></div><div className={css.fields}><Field label="ملاحظات"><textarea rows={4} maxLength={1000} value={payload.note} onChange={e => patch({ note: e.target.value })} /></Field><Field label="الشروط"><textarea rows={4} maxLength={3000} value={payload.terms} onChange={e => patch({ terms: e.target.value })} /></Field></div></section>
      </fieldset>
    </form>
    <Modal open={modal === "preview"} title="معاينة الإشعار الدائن" onClose={() => setModal(null)}><div className={css.previewBody}><CreditNoteDocument model={preview} /></div></Modal>
    <Modal open={modal === "customer"} title="إضافة عميل" onClose={() => { if (!busy) setModal(null); }}><FinanceCustomerForm pending={busy} error="" values={{ kind: "customer" }} onSubmit={async (_operation, data) => onCreateCustomer(data)} onSaved={() => setModal(null)} onCancel={() => setModal(null)} /></Modal>
    <Modal open={modal === "issue"} title="إصدار الإشعار الدائن" onClose={() => { if (!busy) setModal(null); }} panelClassName="w-full max-w-lg overflow-hidden rounded-2xl bg-white"><div className={css.confirm}><p>سيضاف مبلغ الإشعار إلى رصيد العميل عند الإصدار ويُسجل القيد المحاسبي</p>{payload.stockRequired && <p>استلام البضاعة يحتاج تأكيدًا منفصلًا من تبويب الأذون المخزنية</p>}<p>بعد الإصدار لا يمكن تعديل الإشعار أو حذفه</p><CreditNoteTotals {...amounts} /><div className={css.actions}><button type="button" className={styles.primary} disabled={busy || disabled} onClick={() => void store(true)}>تأكيد الإصدار</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setModal(null)}>رجوع للمراجعة</button></div></div></Modal>
    <Modal open={modal === "cancel"} title="مغادرة دون حفظ" onClose={() => setModal(null)} panelClassName="w-full max-w-lg overflow-hidden rounded-2xl bg-white"><div className={css.confirm}><p>لديك تعديلات لم تُحفظ</p><div className={css.actions}><button className={styles.primary} onClick={() => setModal(null)}>متابعة التعديل</button><button className={styles.secondary} onClick={onCancel}>تجاهل التعديلات</button></div></div></Modal>
  </div>;
}
