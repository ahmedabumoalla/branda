"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { useInvoicePointsOutbox } from "./use-invoice-points-outbox";
import { useCashierLanguage } from "@/components/cashier/cashier-language";
import type { PointsProgram } from "@/lib/loyalty/points-program";
import { normalizeLoyaltyDigits } from "@/lib/loyalty/read-identifier";
import { RastCameraScanner } from "./rast-camera-scanner";
import styles from "./rast-cashier.module.css";

type Queue = ReturnType<typeof useInvoicePointsOutbox>;
const reasonText: Record<string,string> = {
  approval_pending: "العملية بانتظار موافقة المسؤول",
  enrollment_rate_limited: "تأجل تسجيل العضوية وستعاد المزامنة تلقائيًا",
  unauthorized: "تحقق من جلسة الكاشير لاستكمال المزامنة",
  points_rate_changed: "تغيرت تسعيرة النقاط حدّث الصفحة ثم راجع الفاتورة",
  points_mode_changed: "تغير نوع برنامج الولاء حدّث الصفحة",
  zero_points: "قيمة الفاتورة أقل من الحد اللازم لكسب نقطة",
  points_limit: "تتجاوز نقاط الفاتورة الحد الأعلى لرصيد البطاقة",
  approval_rejected: "رفض المسؤول عملية إضافة النقاط",
  card_unavailable: "تحقق من رقم البطاقة أو الجوال",
};

export function InvoicePointsHistory({ queue }: { queue: Queue }) {
  const { t, locale } = useCashierLanguage();
  if (!queue.rows.length && !queue.storageError) return null;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const waiting = queue.rows.filter(r => r.state === "waiting").length;
  const credited = queue.rows.filter(r => r.state === "credited").length;
  const rejected = queue.rows.length - waiting - credited;
  return <section className={styles.readStatus} aria-label={t("مزامنة نقاط الفواتير")}>
    <p role="status">{t({ text: "قيد المزامنة {waiting} · تم التسجيل {credited} · مرفوضة {rejected}",
      values: { waiting: number(waiting), credited: number(credited), rejected: number(rejected) } })}</p>
    {queue.storageError && <p role="alert" className={styles.readAlert}>{t("تعذر فتح سجل الفواتير المحفوظة على الجهاز")}</p>}
    {(waiting > 0 || queue.storageError) && <button type="button" className={styles.historyToggle} onClick={queue.retry}>{t("مزامنة الآن")}</button>}
    <details className={styles.guide}><summary>{t("سجل نقاط الفواتير")}</summary>
      <div className={styles.historyRows}>{queue.rows.map(row => <article key={row.requestId}>
        <header><strong>{t(row.state === "credited" ? "تم تسجيل النقاط" : row.state === "rejected" ? "لم تُسجل النقاط" : "قيد المزامنة")}</strong>
          <time dateTime={new Date(row.createdAt).toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(row.createdAt)}</time></header>
        <p><bdi>{row.hint}</bdi> · {number(row.amountHalalas / 100)} {t("ريال")}</p>
        {row.state === "credited" ? <p>{t({ text: "أضيفت {points} نقطة والرصيد بعد الفاتورة {balance}", values: { points: number(row.pointsAdded ?? 0), balance: number(row.pointsBalance ?? 0) } })}</p>
          : <p>{t(row.reason && reasonText[row.reason] || (row.state === "rejected" ? "تحقق من الفاتورة والبطاقة" : "الفاتورة محفوظة وتنتظر تأكيد النظام"))}</p>}
      </article>)}</div>
    </details>
  </section>;
}
const field = "min-h-11 w-full min-w-0 rounded-xl border border-[var(--cashier-ink)]/30 bg-white px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2";

function invoiceHalalas(input: string) {
  const value = normalizeLoyaltyDigits(input).replace("٫", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return 0;
  const [riyals, fraction = ""] = value.split(".");
  const amount = Number(riyals) * 100 + Number(fraction.padEnd(2, "0"));
  return amount <= 100_000_000 ? amount : 0;
}

export function CashierInvoicePoints({ queue, program }: { queue: Queue; program: PointsProgram }) {
  const { t, locale } = useCashierLanguage();
  const id = useId();
  const cardInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const refocus = useRef(false);
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const halalas = invoiceHalalas(amount);
  const earned = Math.floor(halalas * program.rateQuantity / Math.round(program.rateSar * 100));
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  useEffect(() => {
    if (!pending && refocus.current) { refocus.current = false; cardInput.current?.focus(); }
  }, [pending, identifier]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !identifier.trim() || !halalas || earned < 1) return;
    lock.current = true; setPending(true); setFeedback(""); setError("");
    try {
      await queue.save(identifier, { amountHalalas: halalas, rateSar: program.rateSar, rateQuantity: program.rateQuantity });
      setIdentifier(""); setAmount(""); refocus.current = true;
      setFeedback(t("حُفظت الفاتورة على الجهاز ويمكنك خدمة العميل التالي"));
    } catch (cause) {
      setError(t(cause instanceof Error && cause.message === "invalid_identifier" ? "تحقق من رقم البطاقة أو الجوال"
        : "تعذر حفظ الفاتورة على الجهاز احتفظ بالبيانات وأعد المحاولة"));
    } finally { lock.current = false; setPending(false); }
  }

  return <>
    <h2 id="scan-heading" className={styles.scanTitle}>{t("نقاط الفاتورة")}</h2>
    <p className={styles.scanHelp}>{t({ text: "كل {riyals} ريال تمنح {points} نقطة", values: { riyals: number(program.rateSar), points: number(program.rateQuantity) } })}</p>
    <form onSubmit={submit} className={styles.scanForm} aria-busy={pending}>
      <label htmlFor={id + "-card"}>{t("رقم البطاقة أو رقم الجوال")}</label>
      <input id={id + "-card"} ref={cardInput} className={field} dir="ltr" value={identifier} disabled={pending} maxLength={500}
        autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={e => { setIdentifier(e.target.value); setFeedback(""); setError(""); }} required />
      <RastCameraScanner disabled={pending} onDetected={value => { setIdentifier(value); setError(""); setFeedback(""); amountInput.current?.focus(); }} />
      <label htmlFor={id + "-amount"}>{t("قيمة الفاتورة بالريال")}</label>
      <input id={id + "-amount"} ref={amountInput} className={field} dir="ltr" inputMode="decimal" placeholder="0.00" autoComplete="off"
        value={amount} maxLength={10} disabled={pending} onChange={e => { setAmount(e.target.value); setFeedback(""); setError(""); }} required />
      {amount && <p aria-live="polite">{halalas > 0 ? t({ text: "نقاط هذه الفاتورة {points}", values: { points: number(earned) } }) : t("أدخل مبلغًا حتى مليون ريال وبحد أقصى منزلتين عشريتين")}</p>}
      <button type="submit" className={styles.confirmButton} disabled={pending || !identifier.trim() || !halalas || earned < 1}>{t(pending ? "جارٍ حفظ الفاتورة" : "تسجيل نقاط الفاتورة")}</button>
    </form>
    {feedback && <p role="status" className={styles.readFeedback}>{feedback}</p>}
    {error && <p role="alert" className={styles.readAlert}>{error}</p>}
  </>;
}
