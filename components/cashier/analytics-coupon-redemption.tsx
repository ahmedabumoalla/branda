"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { TicketPercent } from "lucide-react";
import { loadAnalyticsCouponAction, redeemAnalyticsCouponAction } from "@/app/actions/analytics-coupons";
import { normalizeAnalyticsCouponPhone, type AnalyticsCouponLookupInput, type AnalyticsCouponPreview, type AnalyticsCouponRedeemInput } from "@/lib/analytics/analytics-coupons";
import { useCashierLanguage } from "@/components/cashier/cashier-language";
import styles from "./analytics-coupon-redemption.module.css";

type Review = { input: AnalyticsCouponLookupInput; data: AnalyticsCouponPreview };
type Notice = { ar: string; en: string };

const retryNotice = {
  ar: "لم يصل تأكيد الصرف أبقِ بيانات الفاتورة كما هي واضغط التحقق من نتيجة الصرف لمعرفة النتيجة دون تكرار الخصم",
  en: "Redemption was not confirmed Keep these invoice details and check the result without applying the discount again",
};

function moneyInput(raw: string) {
  const value = raw.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632))).replace("٫", ".");
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return amount > 0 && amount <= 1000000 ? amount : null;
}

/** Confirmation records a coupon redemption; it does not collect a payment. */
export function AnalyticsCouponRedemption() {
  const { locale } = useCashierLanguage();
  const copy = (ar: string, en: string) => locale === "ar" ? ar : en;
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [completed, setCompleted] = useState<AnalyticsCouponPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const processing = useRef(false);
  const attempt = useRef<AnalyticsCouponRedeemInput | null>(null);
  const locked = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const reviewElement = useRef<HTMLElement>(null);
  const noticeElement = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (review || completed) reviewElement.current?.focus(); }, [review, completed]);
  useEffect(() => { if (notice) noticeElement.current?.focus(); }, [notice]);

  function edit(set: (value: string) => void, value: string) {
    if (processing.current || locked.current) return;
    set(value);
    setReview(null);
    setCompleted(null);
    setNotice(null);
    attempt.current = null;
  }

  function errorNotice(message: string, errorCode: string): Notice {
    const english: Record<string, string> = {
      unauthorized: "Your session or loyalty permission is unavailable Sign in again",
      already_redeemed: "This coupon has already been redeemed Do not apply the discount again",
      not_available: "This coupon is unavailable Check the code, customer phone, expiry and minimum invoice amount",
      invalid: "Check the coupon code, customer phone and invoice amount",
    };
    return { ar: message, en: english[errorCode] ?? "Unable to check the coupon Try again" };
  }

  async function inspect() {
    if (processing.current || locked.current) return;
    const normalizedCode = code.trim().toUpperCase();
    const normalizedPhone = normalizeAnalyticsCouponPhone(phone);
    const amount = moneyInput(subtotal);
    setReview(null);
    setCompleted(null);
    setNotice(null);
    attempt.current = null;
    if (!/^BC-[A-F0-9]{32}$/.test(normalizedCode)) {
      setNotice({ ar: "أدخل رمز الكوبون كاملًا كما وصل للعميل في واتساب", en: "Enter the full coupon code from the customer's WhatsApp message" }); return;
    }
    if (!normalizedPhone) {
      setNotice({ ar: "أدخل رقم جوال العميل المسجل المرتبط بالكوبون", en: "Enter the customer's registered Saudi phone number linked to this coupon" }); return;
    }
    if (amount === null) {
      setNotice({ ar: "أدخل مبلغ الفاتورة قبل الخصم من 0.01 إلى 1000000 ريال وبمنزلتين عشريتين كحد أقصى", en: "Enter the invoice amount before discount from 0.01 to 1000000 SAR with up to two decimal places" }); return;
    }
    const input = { code: normalizedCode, phone: normalizedPhone, subtotal: amount };
    processing.current = true; setPending(true);
    try {
      const result = await loadAnalyticsCouponAction(input);
      if (!result.ok) { setNotice(errorNotice(result.message, result.code)); return; }
      if (result.data.status !== "available") {
        setNotice({ ar: "هذا الكوبون مصروف مسبقًا لا تطبّق الخصم مرة أخرى", en: "This coupon has already been redeemed Do not apply the discount again" }); return;
      }
      setReview({ input, data: result.data });
    } catch {
      setNotice({ ar: "تعذر فحص الكوبون تحقق من الاتصال وحاول مرة أخرى", en: "Unable to check the coupon Check your connection and try again" });
    } finally { processing.current = false; setPending(false); }
  }

  async function confirm() {
    if (processing.current || !review || completed) return;
    const reconciling = locked.current && attempt.current !== null;
    processing.current = true; setPending(true); setNotice(null);
    try {
      attempt.current ??= { ...review.input, idempotencyKey: crypto.randomUUID() };
      locked.current = true;
      const result = await redeemAnalyticsCouponAction(attempt.current);
      if (!result.ok) {
        if (result.code === "uncertain" || (reconciling && result.code !== "already_redeemed")) {
          setUncertain(true);
          const error = errorNotice(result.message, result.code);
          setNotice(result.code === "uncertain" ? retryNotice : { ar: `${error.ar} — ${retryNotice.ar}`, en: `${error.en} — ${retryNotice.en}` });
          return;
        }
        locked.current = false; attempt.current = null; setUncertain(false); setReview(null);
        setNotice(errorNotice(result.message, result.code)); return;
      }
      if (result.data.status !== "redeemed") { setUncertain(true); setNotice(retryNotice); return; }
      locked.current = false; attempt.current = null; setUncertain(false);
      setCompleted(result.data);
    } catch {
      if (attempt.current) { locked.current = true; setUncertain(true); setNotice(retryNotice); }
      else setNotice({ ar: "تعذر تجهيز عملية الصرف أعد المحاولة من متصفح محدث", en: "Unable to prepare redemption Retry using an up-to-date browser" });
    } finally { processing.current = false; setPending(false); }
  }

  function reset() {
    if (processing.current || locked.current) return;
    setCode(""); setPhone(""); setSubtotal(""); setReview(null); setCompleted(null); setNotice(null);
    attempt.current = null;
    codeInput.current?.focus();
  }

  const data = completed ?? review?.data;
  const formatMoney = (value: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(new Date(value));
  const currency = copy("ر.س", "SAR");

  return <section className={styles.panel} aria-labelledby="analytics-coupon-heading" aria-busy={pending}>
    <header className={styles.header}>
      <span className={styles.icon}><TicketPercent size={22} aria-hidden="true" /></span>
      <div><h2 id="analytics-coupon-heading">{copy("صرف كوبون خاص", "Redeem a personal coupon")}</h2>
        <p id="analytics-coupon-help" className={styles.help}>{copy("أدخل الكوبون المرسل للعميل ورقم جواله ثم راجع الخصم قبل تأكيد الصرف", "Enter the customer's coupon and phone then review the discount before confirming redemption")}</p></div>
    </header>
    <form onSubmit={event => { event.preventDefault(); startTransition(async () => { await inspect(); }); }}>
      <fieldset className={styles.fields} disabled={pending || uncertain}>
        <legend className="sr-only">{copy("بيانات الكوبون والفاتورة", "Coupon and invoice details")}</legend>
        <label className={styles.field} htmlFor="analytics-coupon-code">{copy("رمز الكوبون", "Coupon code")}
          <input id="analytics-coupon-code" ref={codeInput} value={code} onChange={event => edit(setCode, event.target.value)} dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={60} placeholder="BC-…" aria-describedby="analytics-coupon-help" required /></label>
        <label className={styles.field} htmlFor="analytics-coupon-phone">{copy("رقم جوال العميل", "Customer phone")}
          <input id="analytics-coupon-phone" value={phone} onChange={event => edit(setPhone, event.target.value)} dir="ltr" type="tel" inputMode="tel" autoComplete="off" maxLength={30} placeholder="05xxxxxxxx" required /></label>
        <label className={styles.field} htmlFor="analytics-coupon-subtotal">{copy("الفاتورة قبل الخصم بالريال", "Invoice before discount in SAR")}
          <input id="analytics-coupon-subtotal" value={subtotal} onChange={event => edit(setSubtotal, event.target.value)} dir="ltr" inputMode="decimal" autoComplete="off" maxLength={12} placeholder="0.00" required /></label>
      </fieldset>
      {!data && <button className={styles.primary} type="submit" disabled={pending || uncertain}>{pending ? copy("جاري التحقق", "Checking") : copy("فحص الكوبون ومعاينة الخصم", "Check coupon and preview discount")}</button>}
    </form>
    {data && <section className={styles.review} ref={reviewElement} tabIndex={-1} aria-labelledby="analytics-coupon-review-heading">
      <h3 id="analytics-coupon-review-heading">{completed ? copy("تم تسجيل صرف الكوبون", "Coupon redemption recorded") : copy("راجع الخصم قبل التأكيد", "Review the discount before confirming")}</h3>
      <div className={styles.identity}><strong>{data.customerName}</strong><bdi dir="ltr">{review?.input.phone}</bdi><code dir="ltr">{review?.input.code}</code></div>
      <p>{data.title}</p>
      <dl className={styles.totals}>
        <div><dt>{copy("قبل الخصم", "Before discount")}</dt><dd>{formatMoney(data.subtotal)} <span>{currency}</span></dd></div>
        <div><dt>{copy("قيمة الخصم", "Discount amount")}</dt><dd>{formatMoney(data.discountAmount)} <span>{currency}</span></dd></div>
        <div className={styles.payable}><dt>{copy("المبلغ بعد الخصم", "Amount after discount")}</dt><dd>{formatMoney(data.totalAfterDiscount)} <span>{currency}</span></dd></div>
      </dl>
      <div className={styles.conditions}>
        <p>{copy("الخصم", "Discount")}: {data.discountType === "percentage" ? `${data.discountValue}%` : `${formatMoney(data.discountValue)} ${currency}`}</p>
        <p>{copy("الحد الأدنى للفاتورة", "Minimum invoice amount")}: {formatMoney(data.minimumOrderAmount)} {currency}</p>
        <p>{copy("صالح حتى", "Valid until")}: <time dateTime={data.expiresAt}>{formatDate(data.expiresAt)}</time> {copy("بتوقيت الرياض", "Riyadh time")}</p>
        {data.terms && <p className={styles.terms}>{data.terms}</p>}
      </div>
      {completed ? <p className={`${styles.notice} ${styles.success}`} role="status">{copy("الكوبون مستخدم الآن ولا يمكن صرفه مرة أخرى طبّق المبلغ الموضح على الفاتورة", "This coupon is now used and cannot be redeemed again Apply the displayed amount to the invoice")}{completed.redeemedAt && <> — <time dateTime={completed.redeemedAt}>{formatDate(completed.redeemedAt)}</time></>}</p>
        : <p className={styles.help}>{copy("تأكيد الصرف يستخدم الكوبون مرة واحدة ولا يحصّل مبلغ الفاتورة", "Confirming uses this coupon once and does not collect the invoice payment")}</p>}
      <div className={styles.actions}>
        {!completed && <button type="button" className={styles.primary} disabled={pending} onClick={() => startTransition(async () => { await confirm(); })}>{pending ? copy("جاري التحقق", "Checking") : uncertain ? copy("التحقق من نتيجة الصرف", "Check redemption result") : copy("تأكيد الخصم وصرف الكوبون", "Confirm discount and redeem coupon")}</button>}
        <button type="button" className={styles.secondary} disabled={pending || uncertain} onClick={reset}>{copy("كوبون آخر", "Another coupon")}</button>
      </div>
    </section>}
    {notice && <p ref={noticeElement} tabIndex={-1} role="alert" className={`${styles.notice} ${uncertain ? styles.retry : styles.error}`}>{notice[locale]}</p>}
  </section>;
}
