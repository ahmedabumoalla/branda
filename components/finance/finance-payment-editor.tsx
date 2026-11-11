"use client";

import { useRef, useState } from "react";
import { Save, X } from "lucide-react";
import { manageInvoicePaymentAction } from "@/app/actions/finance-payment-management";
import type { InvoicePayment } from "@/lib/finance/payment-management";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceFile } from "@/lib/finance/company-invoice-options";
import { CompanyInvoiceFiles } from "./company-invoice-files";
import { Numeric } from "./finance-ui";
import styles from "./finance-payment-editor.module.css";

type Props = {
  payment: InvoicePayment; invoiceNumber: number; snapshot: FinanceSnapshot;
  collectors: { id: string; name: string }[]; deleting?: boolean; disabled: boolean;
  onCancel: () => void; onSaved: () => void | Promise<void>;
};

export function FinancePaymentEditor({ payment, invoiceNumber, snapshot, collectors, deleting = false, disabled, onCancel, onSaved }: Props) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [date, setDate] = useState(payment.date);
  const [accountId, setAccountId] = useState(payment.accountId);
  const [status, setStatus] = useState<"completed" | "pending">(payment.status === "pending" ? "pending" : "completed");
  const [collectorId, setCollectorId] = useState(payment.collectorId);
  const [reference, setReference] = useState(payment.reference);
  const [details, setDetails] = useState(payment.details);
  const [receiptNote, setReceiptNote] = useState(payment.receiptNote);
  const [files, setFiles] = useState<InvoiceFile[]>(payment.attachments);
  const [busy, setBusy] = useState(false);
  const [filesBusy, setFilesBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const blocked = disabled || busy || filesBusy;
  const moneyLocked = blocked || !payment.canChangeFinancials;
  const accounts = snapshot.accounts.filter(account => ["cash", "bank", "pos"].includes(account.kind) && (account.active || account.id === payment.accountId));
  const kindNames: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", pos: "نقاط البيع" };

  async function submit() {
    if (lock.current || blocked || (deleting ? !payment.canDelete : !payment.canEdit)) return;
    setError("");
    if (!deleting && (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || Math.round(Number(amount) * 100) / 100 !== Number(amount))) { setError("أدخل مبلغ دفع صحيحًا بمنزلتين عشريتين كحد أقصى"); return; }
    const change = deleting ? { action: "delete" as const, reason: "حذف دفعة من إدارة الفواتير" } : { action: "save" as const, payload: { amount: Number(amount), date, accountId, status, collectorId, reference: reference.trim(), details: details.trim(), receiptNote: receiptNote.trim(), attachments: files.map(file => file.id) } };
    const input = { invoiceId: payment.invoiceId, paymentId: payment.id, revision: payment.revision, ...change };
    const fingerprint = JSON.stringify(input);
    if (!retry.current || retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() };
    lock.current = true; setBusy(true);
    let saved = false;
    try {
      const result = await manageInvoicePaymentAction({ ...input, requestId: retry.current.id }, snapshot.cafe.slug);
      if (!result.ok) { setError(result.message); return; }
      saved = true; await onSaved();
    } catch { setError(saved ? "تم حفظ العملية لكن تعذر تحديث العرض أعد تحميل الفاتورة" : "تعذر تأكيد نتيجة العملية أعد المحاولة بنفس البيانات"); }
    finally { lock.current = false; setBusy(false); }
  }

  if (deleting) return <section className={styles.confirmation} dir="rtl" aria-busy={busy}>
    <h2>رسالة تأكيد</h2>
    <p>هل أنت متأكد من حذف عملية الدفع من هذه الفاتورة</p>
    <p className={styles.deleteAmount}><Numeric value={payment.amount} money /></p>
    <span className={styles.invoiceNumber}>الفاتورة <bdi>#{String(invoiceNumber).padStart(6, "0")}</bdi></span>
    {payment.effectiveAmount > 0 && <p className={styles.hint}>سيُحدّث المبلغ المدفوع والمتبقي على الفاتورة</p>}
    {!payment.canDelete && <p role="alert" className={styles.error}>{payment.blockedReason || "حذف هذه الدفعة غير متاح"}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.confirmActions}><button type="button" className={styles.save} disabled={blocked || !payment.canDelete} onClick={() => void submit()}>{busy ? "جار الحذف" : "نعم"}</button><button type="button" className={styles.no} disabled={busy} onClick={onCancel}>لا</button></div>
  </section>;

  return <form className={styles.page} dir="rtl" aria-busy={busy || filesBusy} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <div className={styles.topbar}><button type="submit" className={styles.save} disabled={blocked || !payment.canEdit}><Save size={16} aria-hidden="true" />{busy ? "جار تحديث الدفع" : "تحديث الدفع"}</button><button type="button" className={styles.cancel} disabled={busy || filesBusy} onClick={onCancel}><X size={16} aria-hidden="true" />إلغاء</button></div>
    <section className={styles.panel}><h2>بيانات الدفع</h2>
      {payment.blockedReason && <p className={styles.notice}>{payment.blockedReason}</p>}
      <fieldset disabled={blocked || !payment.canEdit} className={styles.fields}>
        <label>مبلغ الدفع<div className={styles.money}><input type="number" min="0.01" max="1000000000" step="0.01" required value={amount} disabled={moneyLocked} onChange={event => setAmount(event.target.value)} /><span dir="ltr">SAR</span></div></label>
        <label>التاريخ<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>
        <label>وسيلة الدفع<select required disabled={moneyLocked} value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">اختر حساب التحصيل</option>{!accounts.some(account => account.id === payment.accountId) && payment.accountId && <option value={payment.accountId}>{payment.accountName || "الحساب المسجل"}</option>}{accounts.map(account => <option key={account.id} value={account.id}>{kindNames[account.kind]} — {account.name}</option>)}</select></label>
        <label>حالة الدفع<select disabled={moneyLocked} value={status} onChange={event => setStatus(event.target.value as "completed" | "pending")}><option value="completed">مكتمل</option><option value="pending">معلق</option></select></label>
        <label>تم التحصيل بواسطة<select required value={collectorId} onChange={event => setCollectorId(event.target.value)}><option value="">اختر المسؤول عن التحصيل</option>{!collectors.some(collector => collector.id === payment.collectorId) && payment.collectorId && <option value={payment.collectorId}>{payment.collectorName || "المستخدم المسجل"}</option>}{collectors.map(collector => <option key={collector.id} value={collector.id}>{collector.name}</option>)}</select></label>
        <label>رقم معرف<input maxLength={160} value={reference} onChange={event => setReference(event.target.value)} /></label>
        <label>بيانات الدفع<textarea rows={3} maxLength={1000} value={details} onChange={event => setDetails(event.target.value)} /></label>
        <label>ملاحظات إيصال الاستلام<textarea rows={3} maxLength={500} value={receiptNote} onChange={event => setReceiptNote(event.target.value)} /></label>
      </fieldset>
      <div className={styles.attachments}><h3>المرفقات</h3><CompanyInvoiceFiles slug={snapshot.cafe.slug} files={files} onChange={setFiles} disabled={disabled || busy || !payment.canEdit} onBusyChange={setFilesBusy} documentLabel="الدفعة" /></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </form>;
}
