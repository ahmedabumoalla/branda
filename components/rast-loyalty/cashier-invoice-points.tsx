"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { addCashierInvoicePointsAction, inspectPointsCardAction } from "@/app/actions/cashier-invoice-points";
import { useCashierLanguage } from "@/components/cashier/cashier-language";
import type { PointsProgram } from "@/lib/loyalty/points-program";
import { pointsAttemptKey } from "@/lib/loyalty/points-attempt-key";
import { normalizeLoyaltyDigits } from "@/lib/loyalty/read-identifier";
import { RastCameraScanner } from "./rast-camera-scanner";
import styles from "./rast-cashier.module.css";

type Attempt = Awaited<ReturnType<typeof inspectPointsCardAction>> & { requestId: string; storageKey: string; amountHalalas: number };
type Scope = { cafeId: string; cashierId: string };
const field = "min-h-11 w-full min-w-0 rounded-xl border border-[var(--cashier-ink)]/30 bg-white px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2";

function invoiceHalalas(input: string) {
  const value = normalizeLoyaltyDigits(input).replace("٫", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return 0;
  const [riyals, fraction = ""] = value.split(".");
  const amount = Number(riyals) * 100 + Number(fraction.padEnd(2, "0"));
  return amount <= 100_000_000 ? amount : 0;
}

export function CashierInvoicePoints({ scope, program, displayName }: { scope: Scope; program: PointsProgram; displayName: (name: string) => string }) {
  const { t, locale } = useCashierLanguage();
  const id = useId();
  const amountInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const halalas = invoiceHalalas(amount);
  const earned = Math.floor(halalas * program.rateQuantity / Math.round(program.rateSar * 100));
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !identifier.trim() || !halalas || earned < 1) return;
    lock.current = true; setPending(true); setFeedback(""); setError("");
    try {
      if (!attempt) {
        const card = await inspectPointsCardAction(scope, identifier);
        const storageKey = await pointsAttemptKey(scope, card.code, halalas);
        const previous = sessionStorage.getItem(storageKey);
        setAttempt({ ...card, storageKey, requestId: previous || crypto.randomUUID(), amountHalalas: halalas });
        setUncertain(Boolean(previous));
        return;
      }
      // Persist before transmission. Retrying after a lost response uses the
      // same request even after the cashier reopens the form in this tab.
      sessionStorage.setItem(attempt.storageKey, attempt.requestId);
      setUncertain(true);
      const result = await addCashierInvoicePointsAction({
        scope, cardCode: attempt.code, amountHalalas: attempt.amountHalalas, requestId: attempt.requestId,
        rateSar: program.rateSar, rateQuantity: program.rateQuantity,
      });
      if (!result.ok && result.reason === "approval_pending") {
        setFeedback(t("العملية بانتظار موافقة المسؤول أعد التأكيد بعد الموافقة")); return;
      }
      sessionStorage.removeItem(attempt.storageKey);
      setAttempt(null); setUncertain(false);
      if (!result.ok) {
        const errors: Record<string, string> = {
          points_rate_changed: "تغيرت تسعيرة النقاط حدّث الصفحة ثم راجع الفاتورة",
          points_mode_changed: "تغير نوع برنامج الولاء حدّث الصفحة",
          zero_points: "قيمة الفاتورة أقل من الحد اللازم لكسب نقطة",
          points_limit: "تتجاوز نقاط الفاتورة الحد الأعلى لرصيد البطاقة",
          approval_rejected: "رفض المسؤول عملية إضافة النقاط",
        };
        setError(t(errors[result.reason] ?? "تعذر تسجيل النقاط تحقق من البطاقة وصلاحية البرنامج")); return;
      }
      setFeedback(t({ text: "أضيفت {earned} نقطة إلى بطاقة {name} والرصيد الآن {balance} نقطة", values: {
        earned: number(result.pointsAdded), name: displayName(attempt.customerName), balance: number(result.pointsBalance),
      } }));
      setIdentifier(""); setAmount("");
    } catch {
      setError(t(attempt ? "تعذر تأكيد تسجيل النقاط أعد المحاولة بنفس الفاتورة" : "تعذر تجهيز الفاتورة تحقق من البطاقة والاتصال وأعد المحاولة"));
    } finally { lock.current = false; setPending(false); }
  }

  return <>
    <h2 id="scan-heading" className={styles.scanTitle}>{t("نقاط الفاتورة")}</h2>
    <p className={styles.scanHelp}>{t({ text: "كل {riyals} ريال تمنح {points} نقطة", values: { riyals: number(program.rateSar), points: number(program.rateQuantity) } })}</p>
    <form onSubmit={submit} className={styles.scanForm} aria-busy={pending}>
      <label htmlFor={id + "-card"}>{t("رقم البطاقة أو رقم الجوال")}</label>
      <input id={id + "-card"} className={field} dir="ltr" value={identifier} disabled={pending || !!attempt} maxLength={500}
        autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={e => { setIdentifier(e.target.value); setFeedback(""); setError(""); }} required />
      {!attempt && <RastCameraScanner disabled={pending} onDetected={value => { setIdentifier(value); setError(""); setFeedback(""); amountInput.current?.focus(); }} />}
      <label htmlFor={id + "-amount"}>{t("قيمة الفاتورة بالريال")}</label>
      <input id={id + "-amount"} ref={amountInput} className={field} dir="ltr" inputMode="decimal" placeholder="0.00" autoComplete="off"
        value={amount} maxLength={10} disabled={pending || !!attempt} onChange={e => { setAmount(e.target.value); setFeedback(""); setError(""); }} required />
      {amount && <p aria-live="polite">{halalas > 0 ? t({ text: "نقاط هذه الفاتورة {points}", values: { points: number(earned) } }) : t("أدخل مبلغًا حتى مليون ريال وبحد أقصى منزلتين عشريتين")}</p>}
      {attempt && <div className={styles.customerSummary}>
        <strong>{displayName(attempt.customerName)}</strong>
        <p>{t("رصيد النقاط المتاح")} <bdi>{number(attempt.pointsBalance)}</bdi></p>
        {attempt.affordableRewards.length > 0 && <p>{t("يمكن استبدال النقاط مقابل")} {attempt.affordableRewards.map(option => option.reward).join(locale === "ar" ? "، " : ", ")}</p>}
      </div>}
      <button type="submit" className={styles.confirmButton} disabled={pending || !identifier.trim() || !halalas || earned < 1}>{t(pending ? "جارٍ التحقق من الفاتورة" : uncertain ? "إعادة تأكيد العملية" : attempt ? "تأكيد إضافة النقاط" : "مراجعة الفاتورة")}</button>
      {attempt && !uncertain && <button type="button" className="min-h-11 underline" disabled={pending} onClick={() => setAttempt(null)}>{t("تعديل الفاتورة")}</button>}
    </form>
    {feedback && <p role="status" className={styles.readFeedback}>{feedback}</p>}
    {error && <p role="alert" className={styles.readAlert}>{error}</p>}
  </>;
}
