import { Save, X } from "lucide-react";
import { invoiceInstallments, type InvoiceDetail, type InvoiceSchedule } from "@/lib/finance/invoice-management";
import { Numeric } from "./finance-ui";
import styles from "./invoice-installment-editor.module.css";

export const installmentFrequencies: Record<InvoiceSchedule["frequency"], string> = {
  weekly: "أسبوعيًا", fortnightly: "مرة كل أسبوعين", monthly: "شهريًا", quarterly: "ربع سنوي", half_yearly: "نصف سنوي", yearly: "سنويًا",
};
export function newInvoiceSchedule(): InvoiceSchedule {
  return { amount: 0, start: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), frequency: "monthly", note: "" };
}

export function InvoiceInstallmentEditor({ detail, customer, schedule, onChange, blocked, busy, error, onSave, onDelete, onCancel }: {
  detail: InvoiceDetail; customer: string; schedule: InvoiceSchedule; onChange: (schedule: InvoiceSchedule) => void;
  blocked: boolean; busy: boolean; error: string; onSave: () => void; onDelete: () => void; onCancel: () => void;
}) {
  const total = detail.document.total;
  const validAmount = Number.isFinite(schedule.amount) && schedule.amount >= .01 && schedule.amount <= total && Math.abs(schedule.amount * 100 - Math.round(schedule.amount * 100)) < .000001;
  const count = validAmount ? Math.ceil(Math.round(total * 100) / Math.round(schedule.amount * 100)) : 0;
  const rows = validAmount && count <= 600 ? invoiceInstallments(total, schedule) : [];
  const last = rows.at(-1);
  const allowed = !!detail.document.party_id && !detail.document.refunded;
  const valid = allowed && !!last && schedule.note.length <= 500;
  const amountError = schedule.amount !== 0 && !validAmount ? "أدخل مبلغًا من 0.01 حتى إجمالي الفاتورة وبمنزلتين عشريتين كحد أقصى" : count > 600 ? "الحد الأقصى 600 قسط ارفع مبلغ القسط" : "";
  return <section className={styles.page} dir="rtl" aria-label="إنشاء أو تعديل اتفاقية التقسيط" aria-busy={busy}>
    <form onSubmit={event => { event.preventDefault(); if (!blocked && valid) onSave(); }}>
      <div className={styles.actions}><button type="submit" className={styles.save} disabled={blocked || !valid}><Save size={15} aria-hidden="true" />{busy ? "جار الحفظ" : "حفظ"}</button><button type="button" disabled={busy} onClick={onCancel}><X size={15} aria-hidden="true" />إلغاء</button></div>
      <div className={styles.panel}><h2>معلومات اتفاقية التقسيط</h2>{error && <p className={styles.error} role="alert">{error}</p>}
        {!allowed && <p className={styles.error} role="alert">اتفاقية التقسيط تتطلب فاتورة مرتبطة بعميل مسجل وغير مرتجعة بالكامل</p>}
        <fieldset disabled={blocked || !allowed}>
          <div className={styles.customerRow}><label>العميل<div className={styles.customer}><span aria-hidden="true">{customer.trim().slice(0, 1) || "؟"}</span><input readOnly value={customer} /></div><small>العميل المرتبط بالفاتورة</small></label></div>
          <div className={styles.section}><label>مبلغ اتفاقية التقسيط<div className={styles.currency}><input type="text" readOnly value={total.toFixed(2)} /><span>SAR</span></div></label><label>رقم الفاتورة<input readOnly value={String(detail.invoice?.number ?? detail.document.number).padStart(6, "0")} /></label></div>
          <div className={styles.section}>
            <label>مبلغ القسط <em aria-hidden="true">*</em><div className={styles.currency}><input autoFocus required type="number" min="0.01" max={total} step="0.01" inputMode="decimal" value={schedule.amount || ""} aria-invalid={!!amountError} aria-describedby={amountError ? "installment-amount-error" : undefined} onChange={event => onChange({ ...schedule, amount: Number(event.target.value) })} /><span>SAR</span></div>{amountError && <small id="installment-amount-error" className={styles.validation} role="alert">{amountError}</small>}</label>
            <label>عدد الأقساط<input type="number" readOnly value={count} /><small>يُحسب تلقائيًا من مبلغ القسط</small></label>
            <label>معدل السداد <em aria-hidden="true">*</em><select required value={schedule.frequency} onChange={event => onChange({ ...schedule, frequency: event.target.value as InvoiceSchedule["frequency"] })}>{Object.entries(installmentFrequencies).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>تاريخ بدء الأقساط <em aria-hidden="true">*</em><input required type="date" value={schedule.start} onChange={event => onChange({ ...schedule, start: event.target.value })} /></label>
            {last && <p className={styles.preview} role="status">آخر قسط <Numeric value={last.amount} money /> بتاريخ <time dateTime={last.date}>{last.date}</time>{last.amount !== schedule.amount && <span>يشمل المبلغ المتبقي من الاتفاقية</span>}</p>}
          </div>
          <div className={styles.notes}><label>ملاحظات<textarea rows={3} maxLength={500} value={schedule.note} onChange={event => onChange({ ...schedule, note: event.target.value })} /></label></div>
        </fieldset>
        <p className={styles.hint}>توزع الاتفاقية إجمالي الفاتورة وتحتسب الدفعات السابقة ضمن السداد حفظ الاتفاقية لا يسجل تحصيلًا جديدًا</p>
      </div>
    </form>
    {detail.metadata.schedule && <details className={styles.delete} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary>حذف الاتفاقية</summary><p>هل تريد حذف جدول الأقساط تبقى الفاتورة والدفعات المحفوظة كما هي</p><button type="button" disabled={blocked} onClick={() => { if (!blocked) onDelete(); }}>تأكيد حذف الاتفاقية</button><button type="button" disabled={busy} onClick={event => { event.currentTarget.closest("details")?.removeAttribute("open"); }}>إلغاء الحذف</button></details>}
  </section>;
}
