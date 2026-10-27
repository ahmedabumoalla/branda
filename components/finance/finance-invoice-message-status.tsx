"use client";
import { Ban, Check, CheckCheck, CircleAlert, CircleHelp, Clock3, LoaderCircle, Minus, WifiOff } from "lucide-react";
import type { InvoiceMessageEntry } from "./invoice-message-cache";
import styles from "./finance-invoice-message-status.module.css";

const states = {
  not_requested: { text: "لم تُطلب رسالة", tone: "muted", icon: Minus, hint: "لم تُنشأ رسالة واتساب لهذه الفاتورة" },
  queued: { text: "في قائمة الإرسال", tone: "pending", icon: Clock3, hint: "الرسالة قيد المعالجة ولم يتأكد إرسالها بعد" },
  sending: { text: "جارٍ الإرسال", tone: "pending", icon: LoaderCircle, hint: "تجري محاولة إرسال الرسالة" },
  sent: { text: "بانتظار تأكيد الوصول", tone: "sent", icon: Check, hint: "قبل مزود واتساب طلب الإرسال ولم يتأكد وصولها للعميل" },
  delivered: { text: "وصلت للعميل", tone: "success", icon: CheckCheck, hint: "أكد واتساب وصول الرسالة إلى جهاز العميل" },
  read: { text: "قرأها العميل", tone: "read", icon: CheckCheck, hint: "أكد واتساب قراءة العميل للرسالة" },
  failed: { text: "فشل الإرسال", tone: "danger", icon: CircleAlert, hint: "لم ينجح إرسال الرسالة" },
  review: { text: "تحتاج مراجعة", tone: "pending", icon: CircleAlert, hint: "نتيجة الإرسال غير مؤكدة ولا تُعاد الرسالة تلقائيًا" },
  unknown: { text: "غير مؤكدة", tone: "muted", icon: CircleHelp, hint: "لا تتوفر حالة مؤكدة للرسالة" },
  cancelled: { text: "أُلغي الإرسال", tone: "muted", icon: Ban, hint: "أُلغيت رسالة هذه الفاتورة" },
};
const reasons: Record<string, string> = {
  no_phone: "لم يُسجل رقم جوال", loyalty_unavailable: "خدمة الولاء غير متاحة", not_queued: "لم تُدرج الرسالة للإرسال",
  provider_rejected: "رفض مزود واتساب الرسالة", delivery_uncertain: "نتيجة الإرسال غير مؤكدة", dispatch_expired: "انتهت مهلة محاولة الإرسال",
  provider_failed: "تعذر الإرسال لدى مزود واتساب", provider_suspended: "خدمة واتساب متوقفة", status_unavailable: "تعذر التحقق من الحالة", cancelled: "أُلغيت الرسالة",
};
export function FinanceInvoiceMessageStatus({ entry, offline = false }: { entry?: InvoiceMessageEntry; offline?: boolean }) {
  if (offline) return <span className={styles.status} data-tone="muted"><WifiOff size={15} aria-hidden="true" /><span>بعد مزامنة الفاتورة</span></span>;
  if (!entry?.delivery) return <span className={styles.status} data-tone="muted" role="status">{entry?.error ? <CircleHelp size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}<span>{entry?.error ? "تعذر التحقق" : "جارٍ التحقق"}</span></span>;
  const state = states[entry.delivery.status] ?? states.unknown;
  const Icon = state.icon;
  const reason = entry.delivery.reason ? reasons[entry.delivery.reason] : undefined;
  return <div className={styles.cell} aria-busy={entry.loading}>
    <span className={styles.status} data-tone={state.tone} title={state.hint}><Icon size={15} aria-hidden="true" /><span>{state.text}</span></span>
    {reason && <small>{reason}</small>}
    {entry.error && <small>آخر حالة محفوظة تعذر تحديثها</small>}
    <span className={styles.srOnly}>{state.hint}</span>
  </div>;
}
