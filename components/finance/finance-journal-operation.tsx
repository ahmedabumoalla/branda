"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import { executeLedgerAction } from "@/app/actions/finance-ledger";
import type { JournalDetail } from "@/lib/finance/journal-detail";
import { Numeric } from "./finance-ui";
import styles from "./finance-journal-detail.module.css";

export type JournalSourceOperation = (data: JournalDetail) => void | Promise<void>;
export function FinanceJournalOperation({ operation, data, slug, disabled, onCancel, onSaved, onOpenDraft, onCopySource, onReverseSource }: {
  operation: "copy" | "reverse"; data: JournalDetail; slug: string; disabled: boolean; onCancel: () => void; onSaved: () => void | Promise<void>; onOpenDraft?: (id: string) => void;
  onCopySource?: JournalSourceOperation; onReverseSource?: JournalSourceOperation;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [title, setTitle] = useState((data.manualDraft?.title || "نسخة من القيد " + data.document.number).slice(0, 150));
  const [date, setDate] = useState(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  const [note, setNote] = useState(data.document.note), [reason, setReason] = useState("");
  const lock = useRef(false), request = useRef<{ signature: string; id: string } | null>(null);
  const copy = operation === "copy", mode = copy ? data.capabilities.copyMode : data.capabilities.reverseMode;
  const manual = mode === "manual" && !!data.manualDraft;
  const callback = copy ? onCopySource : onReverseSource;
  const sourceMode = copy ? mode === "invoice" || mode === "payment" : mode === "refund" || mode === "payment";
  const allowed = (copy ? data.capabilities.canCopy : data.capabilities.canReverse) && (mode === "manual" ? !!data.manualDraft && (!copy || !!onOpenDraft) : sourceMode && !!callback);
  const explanation = manual ? copy ? "ستُنشأ نسخة كمسودة مستقلة لمراجعتها قبل الاعتماد والترحيل" : "سيُنشأ قيد مقابل مرتبط بالأصل مع حفظ القيد المرحل" : mode === "invoice" ? "ستُنشأ مسودة فاتورة من الفاتورة الأصلية لمراجعتها قبل الإصدار" : mode === "refund" ? "ستفتح مراجعة مرتجع الفاتورة لتحديد البنود والمبلغ قبل التأكيد" : copy ? "ستفتح مراجعة دفعة جديدة على الفاتورة الأصلية ولن يثبت التحصيل حتى تحفظها" : "ستفتح رسالة تأكيد إلغاء الدفعة الأصلية لتحديث رصيد الفاتورة";
  async function submit() {
    if (lock.current || busy || disabled || !allowed) return;
    if (manual && ((!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) || (copy ? !title.trim() : reason.trim().length < 5))) { setError("راجع التاريخ والحقول المطلوبة"); return; }
    lock.current = true; setBusy(true); setError(""); let committed = false;
    try {
      if (!manual) { await callback?.(data); onCancel(); return; }
      const draft = data.manualDraft!;
      const payload = copy ? { title: title.trim(), date, note, lines: draft.lines } : { id: draft.id, revision: draft.revision, reason: reason.trim(), date };
      const action = copy ? "save" : "reverse", signature = JSON.stringify({ action, payload });
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const result = await executeLedgerAction({ action, payload, requestId: request.current.id }, slug);
      if (!result.ok) { setError(result.message); return; }
      committed = true;
      if (copy) onOpenDraft?.(result.data.id); else await onSaved();
    } catch (error) { const message = error instanceof Error && /[\u0600-\u06ff]/.test(error.message) && error.message.length <= 400 ? error.message : "تعذر تأكيد العملية أعد المحاولة بنفس البيانات"; setError(committed ? "تم حفظ العملية وتعذر تحديث العرض أعد فتح دفتر الأستاذ" : message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Modal open title={copy ? "نسخ القيد" : "قيد عكسي"} onClose={() => { if (!busy) onCancel(); }} panelClassName="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"><form className={styles.page} dir="rtl" aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}><p className={styles.notice}>{explanation}</p><div className={styles.operationSummary}><span>قيد <bdi>#{String(data.document.number).padStart(6, "0")}</bdi></span><span>مدين <Numeric value={data.totals.debit} money /></span><span>دائن <Numeric value={data.totals.credit} money /></span></div>
    {manual && <fieldset className={styles.operationFields} disabled={busy || disabled}>{copy && <label>عنوان المسودة<input required maxLength={150} value={title} onChange={event => setTitle(event.target.value)} /></label>}<label>التاريخ المحاسبي<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label>{copy ? <label>ملاحظة<textarea maxLength={2000} rows={3} value={note} onChange={event => setNote(event.target.value)} /></label> : <label>سبب العكس<textarea required minLength={5} maxLength={1000} rows={3} value={reason} onChange={event => setReason(event.target.value)} /></label>}</fieldset>}
    {!allowed && <p role="alert" className={styles.error}>{(copy ? data.capabilities.copyReason : data.capabilities.reverseReason) || "هذا الإجراء غير متاح للقيد"}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}<div className={styles.toolbar}><button type="submit" className={styles.primary} disabled={disabled || busy || !allowed}>{busy ? "جار تنفيذ العملية" : manual ? copy ? "إنشاء المسودة" : "تأكيد العكس" : "متابعة"}</button><button type="button" disabled={busy} onClick={onCancel}>إلغاء</button></div></form></Modal>;
}
