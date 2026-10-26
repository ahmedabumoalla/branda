"use client";
import { useRef, useState } from "react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { FinanceShiftAttachment } from "@/lib/finance/shift-attachments";
import type { FinanceForm } from "./finance-operation-form";
import { FinanceShiftAttachments } from "./finance-shift-attachments";
import { Field, Numeric } from "./finance-ui";
import styles from "./finance.module.css";

type Props = { form: FinanceForm; snapshot: FinanceSnapshot; pending: boolean; error: string; onCancel: () => void; onSubmit: (operation: FinanceForm["operation"], payload: Record<string, unknown>) => Promise<boolean> };
export function FinanceSupplierPayoutForm({ form, snapshot, pending, error, onCancel, onSubmit }: Props) {
  const [files, setFiles] = useState<FinanceShiftAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const submitting = useRef(false);
  const shift = snapshot.shifts.find(item => item.id === form.values?.shiftId && item.user_id === snapshot.userId && item.status === "open");
  const busy = pending || uploading || saving;
  const blocked = !shift || shift.supervisor_paused;
  return <form className={styles.form} onSubmit={async event => {
    event.preventDefault(); if (busy || blocked || submitting.current) return;
    setLocalError("");
    const data = new FormData(event.currentTarget);
    const supplierName = String(data.get("supplierName") ?? "").trim();
    const supplierPhone = String(data.get("supplierPhone") ?? "").trim();
    const amount = Number(data.get("amount"));
    if (!supplierName || supplierPhone.length < 5 || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > .00001) { setLocalError("أدخل اسم المورد ورقم جواله ومبلغًا صحيحًا بمنزلتين عشريتين كحد أقصى"); return; }
    submitting.current = true; setSaving(true);
    try { await onSubmit("supplier_payout", { shiftId: shift.id, supplierName, supplierPhone, amount, note: String(data.get("note") ?? "").trim(), attachmentIds: files.map(file => file.id) }); }
    catch { setLocalError("تعذر تأكيد السداد أعد المحاولة بنفس البيانات لمنع التكرار"); }
    finally { submitting.current = false; setSaving(false); }
  }}>
    {(error || localError) && <div className={styles.error} role="alert">{error || localError}</div>}
    {blocked && <p className={styles.notice} role="alert">السداد متاح لصاحب الوردية المفتوحة وغير الموقوفة فقط</p>}
    <p className={styles.notice}>يُسجل سند صرف باسم المورد ويُخصم من صندوق ورديتك ويظهر في تقريرها</p>
    <fieldset disabled={busy || blocked} className="min-w-0 border-0 p-0 grid gap-4">
      <div className={styles.fields}>
        <Field label="اسم المورد"><input name="supplierName" required maxLength={150} autoComplete="organization" /></Field>
        <Field label="رقم جوال المورد"><input name="supplierPhone" type="tel" required minLength={5} maxLength={30} dir="ltr" autoComplete="tel" /></Field>
        <Field label="المبلغ المدفوع من الصندوق"><input name="amount" type="number" required min="0.01" max="999999999" step="0.01" inputMode="decimal" /></Field>
        <div className={styles.notice}><span>رصيد الصندوق الحالي</span><strong className="block text-xl"><Numeric value={shift?.expected_cash ?? 0} money /></strong></div>
      </div>
      <Field label="بيان السداد اختياري"><textarea name="note" maxLength={500} placeholder="رقم فاتورة المورد أو سبب السداد" /></Field>
    </fieldset>
    {shift && <FinanceShiftAttachments slug={snapshot.cafe.slug} shiftId={shift.id} value={files} onChange={setFiles} disabled={pending || saving || blocked} onBusyChange={setUploading} />}
    <div className={styles.formFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={onCancel}>إلغاء</button><button className={styles.primary} disabled={busy || blocked}>{uploading ? "جارٍ رفع المرفقات" : saving || pending ? "جارٍ تسجيل السداد" : "تسجيل سند الصرف"}</button></div>
  </form>;
}
