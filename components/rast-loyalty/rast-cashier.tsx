"use client";
import { getBrandCountry } from "@/lib/auth/brand-phone";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { BadgeCheck, CircleCheck, CircleX, CloudUpload, Gift, LogOut, ScanLine, Search, Phone } from "lucide-react";
import { lookupCashierLoyaltyPhoneAction } from "@/app/actions/cashier-loyalty-phone";
import { lookupRastCashierCardAction, lookupRastCashierRewardAction, scanLoyaltyExperienceAction } from "@/app/actions/loyalty-experience";
import { logoutCashierAction } from "@/app/actions/cashier";
import type { CashierConsole } from "@/lib/data/cashier";
import type { CashierRewardPreview } from "@/lib/data/customer-rewards";
import type { LocalRead } from "@/lib/loyalty/read-outbox";
import { readDisplay } from "@/lib/loyalty/read-display";
import { resolveReadMethod } from "@/lib/loyalty/read-identifier";
import { CashierInvoicePoints, InvoicePointsHistory } from "./cashier-invoice-points";
import { useInvoicePointsOutbox } from "./use-invoice-points-outbox";
import { CashierPointsRedemption } from "./cashier-points-redemption";
import { RastCameraScanner } from "./rast-camera-scanner";
import { useReadOutbox } from "./use-read-outbox";
import { useCustomerSummary } from "./use-customer-summary";
import { CashierCustomerSummary } from "./cashier-customer-summary";
import { createRastScanSession, type RastScanPreview } from "./scan-session";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { loyaltyTheme } from "./loyalty-theme";
import { RastBrand } from "./rast-brand";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";
import { AnalyticsCouponRedemption } from "@/components/cashier/analytics-coupon-redemption";
import { localizedText, type CashierMessage } from "@/lib/cashier/language";
import layout from "./rast-cashier.module.css";
import { CashierGuideButton } from "@/components/cashier/cashier-guide";

export function RastCashierReadSummary({ rows }: { rows: readonly LocalRead[] }) {
  const { t, errorText, locale } = useCashierLanguage();
  const [filter, setFilter] = useState<"all" | "succeeded" | "pending" | "failed" | null>(null);
  const counts = { succeeded: 0, pending: 0, failed: 0 };
  for (const row of rows) counts[readDisplay(row).state]++;
  const counters = [
    { state: "succeeded", count: counts.succeeded, label: "أختام مسجلة", hint: "أختام أكد النظام تسجيلها بنجاح", icon: CircleCheck },
    { state: "pending", count: counts.pending, label: "تحتاج مزامنة", hint: "قراءات محفوظة أو قيد المعالجة أو قابلة لإعادة المزامنة", icon: CloudUpload },
    { state: "failed", count: counts.failed, label: "لم تُسجل", hint: "لم يُضف ختم وتشمل العمليات المرفوضة والمكررة والتي تحتاج مراجعة", icon: CircleX },
  ] as const;
  const displayed = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter(row => filter === "all" || readDisplay(row).state === (filter ?? "failed")).slice(0, 50);
  return <div className={layout.readHistory}>
    <div className={layout.readSummary} aria-live="polite" aria-atomic="true" aria-label={t("ملخص قراءات هذا الجهاز")}>
    {counters.map(counter => <button type="button" key={counter.state} className={layout.readCounter} data-state={counter.state} title={t(counter.hint)} aria-pressed={filter === counter.state} onClick={() => setFilter(counter.state)}>
      <counter.icon size={20} aria-hidden="true" />
      <span>{t(counter.label)}: </span><strong>{new Intl.NumberFormat(locale).format(counter.count)}</strong>
    </button>)}
    </div>
    <button type="button" className={layout.historyToggle} aria-expanded={filter === "all"} onClick={() => setFilter(filter === "all" ? null : "all")}>{t("سجل قراءات هذا الجهاز")}</button>
    {(filter || displayed.length > 0) && <div className={layout.historyRows}>
      <p>{t("النتيجة مؤكدة فقط عند ظهور تم تسجيل الختم")}</p>
      {displayed.length === 0 ? <p>{t("لا توجد قراءات بهذه الحالة")}</p> : displayed.map(row => {
        const display = readDisplay(row);
        return <article key={row.requestId} data-state={display.state}>
          <header><strong>{t(display.label)}</strong><time dateTime={row.createdAt}>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(row.createdAt))}</time></header>
          <p>{row.operation?.customerName || t("القراءة")} <bdi dir="ltr">{row.identifierHint}</bdi></p>
          <p>{errorText(display.detail)}</p>
          {row.errorCode?.startsWith("rejected:") && <p>{t("صحح الرقم أو الرمز ثم أعد القراءة")}</p>}
        </article>;
      })}
    </div>}
  </div>;
}

export function RastCashierEmptyRewards() {
  const { t } = useCashierLanguage();
  return <p role="status" className="mt-5 rounded-xl border border-[var(--cashier-ink)]/20 bg-white/70 p-4 text-sm leading-7">{t("لا توجد مكافآت حالية للصرف")}</p>;
}

export function RastCashierRewardDetails({ reward }: { reward: CashierRewardPreview }) {
  const { t, locale } = useCashierLanguage();
  const content = (key: string, source: string) => localizedText(locale, source, reward.catalog?.fields[key]);
  const raw = reward.metadata?.termsSnapshot;
  const terms = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const discount = terms.rewardKind === "discount" && typeof terms.discountPercent === "number" ? terms.discountPercent : null;
  const product = terms.rewardKind === "product" && typeof terms.rewardProductName === "string" ? terms.rewardProductName : null;
  return <div className="mt-3 space-y-2 text-sm leading-7">
    {discount ? <p className="text-lg font-bold">{t({ text: "خصم {percent}% وفق شروط المكافأة", values: { percent: discount } })}</p> : null}
    {product ? <p className="font-bold">{t("المنتج المستحق:")} {content("product", product)}</p> : null}
    {(reward.rewardDescription || (typeof terms.terms === "string" && terms.terms)) && <details className={layout.rewardTerms}><summary>{t("تفاصيل وشروط المكافأة")}</summary>
      {reward.rewardDescription ? <p className="whitespace-pre-line">{content("description", reward.rewardDescription)}</p> : null}
      {typeof terms.terms === "string" && terms.terms && terms.terms !== reward.rewardDescription ? <p className="whitespace-pre-line">{content("terms", terms.terms)}</p> : null}
    </details>}
    {discount ? <p>{t("طبّق النسبة على الفاتورة وفق الشروط ثم أكّد صرف المكافأة")} </p> : null}
  </div>;
}

export function RastCashier({ initialData, identity: suppliedIdentity, embedded = false, active = true, salonBookings = false, displayName = name => name }: { initialData: CashierConsole; identity?: LoyaltyIdentity; embedded?: boolean; active?: boolean; salonBookings?: boolean; displayName?: (name: string) => string }) {
  const { t, errorText, locale, dir } = useCashierLanguage();
  const identity = suppliedIdentity ?? { name: initialData.cafe.name, slug: initialData.cafe.slug, logoUrl: null };
  const [kind, setKind] = useState<"stamp" | "redeem">("stamp");
  const [stampVoucher, setStampVoucher] = useState(false);
  const points = initialData.pointsProgram?.mode === "points" ? initialData.pointsProgram : null;
  const confirmedFinanceFlow = initialData.cashier.financeLinked === true;
  const [value, setValue] = useState("");
  const [lookupMethod, setLookupMethod] = useState<"code" | "phone">("code");
  const resolvedCode = useRef("");
  const processing = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [noRewards, setNoRewards] = useState(false);
  const [message, setMessage] = useState<CashierMessage>("");
  const [checkedAt, setCheckedAt] = useState(0);
  const [preview, setPreview] = useState<RastScanPreview | null>(null);
  const [newMemberRequest, setNewMemberRequest] = useState("");
  const [session] = useState(() => createRastScanSession({ lookupCard: lookupRastCashierCardAction, lookupReward: lookupRastCashierRewardAction, commit: input => scanLoyaltyExperienceAction({ ...input, expectedScope: { cafeId: initialData.cafe.id, cashierId: initialData.cashier.id } }), createRequestId: () => crypto.randomUUID() }));
  const input = useRef<HTMLInputElement>(null);
  const focusInputAfterScan = useRef(false);
  const previewElement = useRef<HTMLElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const reads = useReadOutbox({ cafeId: initialData.cafe.id, cashierId: initialData.cashier.id }, initialData.cafe.phoneCountry);
  const invoices = useInvoicePointsOutbox({ cafeId: initialData.cafe.id, cashierId: initialData.cashier.id }, Boolean(points), initialData.cafe.phoneCountry);
  const [lastReadId, setLastReadId] = useState<string | null>(null);
  const lastRead = reads.rows.find(row => row.requestId === lastReadId);
  const readFeedback = lastRead ? readDisplay(lastRead) : null;
  const customerSummary = useCustomerSummary({ cafeId: initialData.cafe.id, cashierId: initialData.cashier.id }, initialData.cafe.phoneCountry);
  const [summaryRead, setSummaryRead] = useState<{ requestId: string; lookupId: number; cafeId: string; cashierId: string } | null>(null);
  const selectedRead = summaryRead && summaryRead.cafeId === initialData.cafe.id && summaryRead.cashierId === initialData.cashier.id
    && summaryRead.lookupId === customerSummary.state.id ? reads.rows.find(row => row.requestId === summaryRead.requestId) : undefined;
  const confirmedOperation = selectedRead?.operation;
  const confirmSummary = customerSummary.confirm;
  useEffect(() => {
    if (!summaryRead || confirmedOperation?.status !== "succeeded" || !confirmedOperation.customerName
      || confirmedOperation.stampsInCycle == null || confirmedOperation.purchasesRequired == null || confirmedOperation.availableRewards == null) return;
    confirmSummary(summaryRead.lookupId, { customerName: confirmedOperation.customerName, stampsInCycle: confirmedOperation.stampsInCycle,
      purchasesRequired: confirmedOperation.purchasesRequired, availableRewards: confirmedOperation.availableRewards });
  }, [confirmedOperation, summaryRead, confirmSummary]);
  useEffect(() => { if (preview) previewElement.current?.focus(); }, [preview]);
  useEffect(() => { if (error) errorElement.current?.focus(); }, [error]);
  useEffect(() => { if (!pending && focusInputAfterScan.current) { focusInputAfterScan.current = false; input.current?.focus(); } }, [pending, preview, value]);
  useEffect(() => { if (embedded && active) { if (preview) previewElement.current?.focus(); else input.current?.focus(); } }, [embedded, active, preview]);
  function updateCode(code: string, immediate = false) {
    if (processing.current || session.busy) return;
    setNewMemberRequest("");
    if (summaryRead) customerSummary.clear();
    resolvedCode.current = ""; session.invalidate(); setValue(code); setPreview(null); setMessage(""); setError(""); setNoRewards(false); setSummaryRead(null); setLastReadId(null);
    if (kind === "stamp" && code.trim()) customerSummary.lookup(lookupMethod, code, { immediate });
    else customerSummary.clear();
  }
  function detectCode(code: string) { if (session.busy) return; updateCode(code, true); setMessage(kind === "stamp" ? "تمت قراءة الرمز اضغط تسجيل الختم" : "تمت قراءة الرمز اضغط فحص لعرض بيانات العميل قبل التأكيد"); input.current?.focus(); }
  async function queueStamp() {
    if (confirmedFinanceFlow) { await processScan(Boolean(newMemberRequest)); return; }
    if (processing.current || !value.trim()) return;
    processing.current = true;
    setPending(true); setError(""); setMessage("");
    try {
      // The optional read must never prevent durable stamp intake or leave the form locked.
      let lookupId: number | null = null;
      try { lookupId = customerSummary.lookup(lookupMethod, value, { immediate: true }); }
      catch { console.warn("cashier_summary_unavailable"); }
      const saved = await reads.save(lookupMethod, value);
      setLastReadId(saved.row.requestId);
      if (lookupId !== null) setSummaryRead({ requestId: saved.row.requestId, lookupId, cafeId: initialData.cafe.id, cashierId: initialData.cashier.id });
      setMessage(saved.duplicate ? "هذه القراءة محفوظة مسبقًا وتنتظر المزامنة" : "تم حفظ القراءة على هذا الجهاز يمكنك خدمة العميل التالي وتابع عدادات المزامنة");
      setValue(""); focusInputAfterScan.current = true;
    } catch {
      setError("تعذر حفظ القراءة على الجهاز لم تُرسل العملية احتفظ بالرقم وحاول مجددًا");
    } finally { processing.current = false; setPending(false); }
  }
  async function processScan(confirm = false) {
    if (processing.current || session.busy || !value.trim()) return;
    processing.current = true;
    setPending(true); setError(""); setMessage(""); setNoRewards(false);
    try {
      const phoneInput = lookupMethod === "phone" || (kind === "stamp" && resolveReadMethod(lookupMethod, value, initialData.cafe.phoneCountry) === "phone");
      if (!confirm) {
        setPreview(null);
        let code = value;
        if (phoneInput) {
          const found = await lookupCashierLoyaltyPhoneAction(value);
          if (!found.ok && found.missingCard && kind === "stamp" && confirmedFinanceFlow) {
            setNewMemberRequest(crypto.randomUUID());
            return;
          }
          if (!found.ok) throw new Error(found.message);
          code = found.cardCode;
        }
        resolvedCode.current = code;
        const next = await session.inspect(kind, code);
        setPreview(next); setNoRewards(kind === "redeem" && next === null); return;
      }
      const result: Record<string, unknown> | null = newMemberRequest && kind === "stamp"
        ? await scanLoyaltyExperienceAction({ kind, value, requestId: newMemberRequest, stampByPhone: true, expectedScope: { cafeId: initialData.cafe.id, cashierId: initialData.cashier.id } })
        : await session.confirm(kind, phoneInput ? resolvedCode.current : value);
      if (!result) return;
      setPreview(session.preview);
      const status = String(result.status ?? "");
      if (["stamped", "reward_issued", "redeemed"].includes(status)) {
        const reward = preview?.kind === "redeem" ? preview.reward : null;
        const customer = result.customerName ? displayName(String(result.customerName)) : { ar: "العميل", en: "Customer" };
        setMessage(result.replayed ? "هذه العملية مسجلة سابقًا؛ لم تتكرر إضافة الختم أو صرف المكافأة" : status === "redeemed"
          ? { text: "تم صرف {reward} بنجاح", values: { reward: reward?.catalog?.fields.title ?? { ar: reward?.rewardTitle ?? "المكافأة", en: "Reward" } } }
          : status === "reward_issued" ? { text: "اكتملت البطاقة! استحق {name} مكافأته", values: { name: customer } }
          : { text: "تم تسجيل الختم رصيد {name}: {stamps} من {required}", values: { name: customer, stamps: Number(result.stampsInCycle), required: Number(result.purchasesRequired) } });
        setNewMemberRequest(""); focusInputAfterScan.current = true; setValue(""); setPreview(null);
      } else {
        const errors: Record<string, string> = { recent_scan: "تم تسجيل ختم قريبًا لهذه البطاقة انتظر قبل عملية جديدة", cooldown: "تم تسجيل ختم قريبًا لهذه البطاقة انتظر قبل عملية جديدة", already_redeemed: "هذه المكافأة مصروفة سابقًا", expired: "انتهت صلاحية المكافأة", inactive: "البطاقة غير نشطة", invalid: "الرمز غير صالح أو لا يتبع هذه العلامة", duplicate: "هذه العملية مسجلة بالفعل", reward_unavailable: "المكافأة المحددة صُرفت أو لم تعد متاحة أعد فحص البطاقة؛ لم تُصرف مكافأة أخرى", card_unavailable: "البطاقة أو حساب العميل غير نشط", session_invalid: "انتهت جلسة الكاشير سجّل الدخول من جديد", program_disabled: "برنامج الولاء موقوف حاليًا", request_conflict: "بيانات العملية لا تطابق الطلب السابق أعد فحص الرمز", invalid_code: "الرمز غير صالح أعد فحص البطاقة", operation_failed: "لم تُسجل العملية أعد فحص الرمز وحاول مرة أخرى" };
        errors.daily_stamp_limit = "بلغ العميل الحد اليومي المسموح وهو ختمان يمكن إضافة ختم جديد غدًا";
        errors.approval_pending = "أرسل الطلب لمسؤول الموافقة أعد التأكيد بعد اعتماده من طلبات الموافقة";
        errors.approval_rejected = "رفض مسؤول الموافقة هذه العملية راجع ملاحظة الرفض في طلبات الموافقة";
        if (newMemberRequest && status === "approval_rejected") setNewMemberRequest("");
        setError(errors[status] ?? "لم تسجل العملية تحقق من البطاقة وصلاحية البرنامج");
      }
    } catch (cause) { if (confirm) setPreview(session.preview); setError(cause instanceof Error && /[\u0600-\u06ff]/.test(cause.message) ? cause.message : "تعذر إتمام العملية يمكنك إعادة المحاولة بأمان"); }
    finally { processing.current = false; setCheckedAt(Date.now()); setPending(false); }
  }
  const reward = preview?.kind === "redeem" ? preview.reward : null;
  const expiry = reward?.expiresAt ? new Date(reward.expiresAt) : null;
  const validExpiry = expiry && Number.isFinite(expiry.getTime()) ? expiry : null;
  const remainingText = !validExpiry ? t("بدون تاريخ انتهاء") : validExpiry.getTime() <= checkedAt ? t("انتهت") : t({ text: "باقي {days} يوم", values: { days: Math.ceil((validExpiry.getTime() - checkedAt) / 86_400_000) } });
  const catalog = preview?.kind === "stamp" ? preview.card.catalog : preview?.reward.catalog;
  const canRedeem = preview?.retryPending || (reward?.canRedeem && (!validExpiry || validExpiry.getTime() > checkedAt));
  // Keep the durable read queue syncing while the POS dialog is closed, but
  // unmount the camera so its existing cleanup releases the media stream.
  if (!active) return null;
  const Container = embedded ? "div" : "main";
  return <Container dir={dir} lang={locale} style={{ "--cashier-ink": "#561C2B", "--cashier-paper": "#F5F0E7", "--cashier-button-text": "#FFF6E7", ...loyaltyTheme(identity) } as CSSProperties} className={`${layout.page}${embedded ? ` ${layout.embedded}` : ""}`}>
    <div className={layout.frame}>
      {!embedded && <header className={layout.header}>
        <div className={layout.identity}>{identity.slug === "rast" ? <p className="text-xs tracking-widest" dir="ltr">KAWAKIB · LOYALTY</p> : <RastBrand identity={identity} locale={locale} />}<h1 className="sr-only">{t("كل زيارة تستاهل")}</h1></div>
        <div className={layout.tools}>
        <CashierLanguageSwitch />
            {salonBookings && <Link href="/pager" className={layout.logout}>{locale === "en" ? "Appointments" : "حجوزات الصالون"}</Link>}
            <form action={logoutCashierAction}><button disabled={pending} aria-label={t("تسجيل الخروج")} title={t("تسجيل الخروج")} className={layout.logout}><LogOut size={18} aria-hidden="true" /><span className={layout.logoutLabel}>{t("تسجيل الخروج")}</span></button></form>
        </div>
      <div className={layout.greeting}><p>{t({ text: points ? "أهلًا {name} هنا تسجّل نقاط الفواتير وتصرف المكافآت" : "أهلًا {name} هنا تسجّل الأختام وتصرف المكافآت", values: { name: initialData.cashier.fullName } })}</p><CashierGuideButton /></div>
      </header>}
      <div className={layout.body}>
        {embedded && <div className={layout.guideRow}><CashierGuideButton /></div>}
        <section aria-labelledby={preview ? "rast-scan-preview" : "scan-heading"} className={layout.scanPanel}>
          <div className={layout.tabs} role="group" aria-label={t("نوع العملية")}>
            {([{ id: "stamp", title: t(points ? "تسجيل نقاط" : "تسجيل ختم"), icon: BadgeCheck }, { id: "redeem", title: t("صرف مكافأة"), icon: Gift }] as const).map((tab) => <button key={tab.id} type="button" aria-pressed={kind === tab.id} disabled={pending} onClick={() => { if (processing.current || session.busy) return; setKind(tab.id); setStampVoucher(false); updateCode(""); }} className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4 ${kind === tab.id ? "bg-[var(--cashier-ink)] text-[var(--cashier-button-text)]" : "border border-[var(--cashier-ink)]/20"}`}><tab.icon size={19} aria-hidden="true" />{tab.title}</button>)}
          </div>
          {points && kind === "redeem" && <button type="button" className={layout.voucherSwitch} disabled={pending}
            onClick={() => { if (processing.current || session.busy) return; updateCode(""); setStampVoucher(!stampVoucher); }}>{t(stampVoucher ? "العودة إلى استبدال النقاط" : "صرف قسيمة أختام سابقة")}</button>}
          {points && kind === "stamp" ? <CashierInvoicePoints queue={invoices} program={points} />
            : points && !stampVoucher ? <CashierPointsRedemption scope={{ cafeId: initialData.cafe.id, cashierId: initialData.cashier.id }} displayName={displayName} />
            : !preview && <><h2 id="scan-heading" className={layout.scanTitle}>{kind === "stamp" ? t("اقرأ بطاقة العميل") : t("افحص مكافأة العميل")}</h2>
          <p id="rast-scan-help" className={layout.scanHelp}>{confirmedFinanceFlow ? t("اقرأ بطاقة العميل أو ابحث بجواله ثم راجع بياناته وأكد العملية تنتظر العملية الموافقة إذا حدد المالك مسؤولًا لاعتمادها") : kind === "stamp" ? t("أدخل البطاقة أو رقم الجوال ثم اضغط تسجيل الختم تُحفظ القراءة فورًا ويبحث النظام عن العميل ويسجل الختم في الخلفية") : lookupMethod === "phone" ? t("ابحث برقم الجوال المسجل في بطاقة الولاء ثم راجع بيانات العميل قبل التأكيد") : t("اقرأ بطاقة العميل أو رمز المكافأة ستظهر المكافأة الأقرب لانتهاء الصلاحية؛ راجع اسم العميل وشروطها قبل تأكيد صرف مكافأة واحدة")}</p>
          <div className={layout.lookupMethods} role="group" aria-label={t("طريقة البحث عن العميل")}>
            {([{ id: "code", label: t("البطاقة أو الباركود"), icon: ScanLine }, { id: "phone", label: t("رقم الجوال"), icon: Phone }] as const).map(method => <button key={method.id} type="button" disabled={pending} aria-pressed={lookupMethod === method.id} onClick={() => { if (processing.current || session.busy) return; updateCode(""); setLookupMethod(method.id); }}><method.icon size={16} aria-hidden="true" />{method.label}</button>)}
          </div>
          {!confirmedFinanceFlow && kind === "stamp" && lookupMethod === "phone" && <p className={layout.scanHelp}>{t("رقم الجوال ينشئ بطاقة تلقائيًا للعميل الجديد ويسجل أول ختم")}</p>}
          <form onSubmit={(event) => { event.preventDefault(); if (kind === "stamp") void queueStamp(); else void processScan(); }} className={layout.scanForm} aria-busy={pending}>
            <label htmlFor="rast-scan-code" className="block text-sm font-bold">{lookupMethod === "phone" ? t("رقم جوال العميل") : kind === "stamp" ? t("رقم البطاقة أو رقم الجوال") : t("رمز البطاقة أو المكافأة")}</label>
            <input id="rast-scan-code" ref={input} dir="ltr" type={lookupMethod === "phone" ? "tel" : "text"} inputMode={lookupMethod === "phone" ? "tel" : "text"} value={value} disabled={pending} onChange={(event) => updateCode(event.target.value)} aria-describedby="rast-scan-help" autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={lookupMethod === "phone" ? 30 : 500} placeholder={lookupMethod === "phone" ? getBrandCountry(initialData.cafe.phoneCountry ?? "SA").placeholder : kind === "stamp" ? t("امسح البطاقة أو أدخل رقم البطاقة أو الجوال") : t("امسح بالقارئ أو أدخل الرمز")} className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--cashier-ink)]/30 bg-white px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cashier-ink)]" />
            {newMemberRequest && <p className={layout.scanHelp} role="status">{t("سيُصدر لهذا الجوال بطاقة ولاء عند تأكيد تسجيل الختم")}</p>}
            <button type="submit" disabled={pending || !value.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cashier-ink)] px-4 font-bold text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">{kind === "stamp" ? <BadgeCheck size={19} aria-hidden="true" /> : lookupMethod === "phone" ? <Search size={19} aria-hidden="true" /> : <ScanLine size={19} aria-hidden="true" />}{kind === "stamp" ? pending ? t("جاري حفظ القراءة") : newMemberRequest ? t("تأكيد إصدار البطاقة وتسجيل الختم") : t("تسجيل الختم") : pending ? t("جاري التحقق") : lookupMethod === "phone" ? t("البحث عن العميل") : t("فحص المكافأة")}</button>
          </form>
          {kind === "stamp" && <CashierCustomerSummary state={customerSummary.state} saved={Boolean(selectedRead)} operation={selectedRead?.operation} displayName={displayName} />}
          {lookupMethod === "code" && <RastCameraScanner key={kind} disabled={pending} onDetected={detectCode} />}</>}
          {preview && <section ref={previewElement} tabIndex={-1} className={layout.preview} aria-labelledby="rast-scan-preview">
            {catalog?.unavailable && <p className="mb-2 text-xs leading-5 opacity-75" role="status">{t("تعذرت ترجمة بعض التفاصيل يُعرض النص الأصلي أعد الفحص للمحاولة مجددًا")}</p>}
            {preview.retryPending && <p role="status" className="mb-4 text-sm leading-7">{t(preview.approvalPending ? "العملية بانتظار موافقة المسؤول لم تسجل بعد أعد التأكيد بعد الموافقة" : "لم يصل تأكيد العملية السابقة أعد التأكيد للتحقق من نتيجتها بأمان؛ لن يتم اختيار مكافأة أخرى أو تكرار الصرف لا تسلّم المكافأة مرة أخرى إذا سبق تسليمها")} </p>}
            <div className={layout.previewTop}><p>{preview.kind === "stamp" ? t("بطاقة العميل") : t("مكافأة العميل")}</p><button type="button" disabled={pending} onClick={() => { if (processing.current || session.busy) return; focusInputAfterScan.current = true; updateCode(""); }}>{t("بحث جديد")}</button></div>
            <h3 id="rast-scan-preview" className="break-words text-lg font-bold">{displayName(preview.kind === "stamp" ? preview.card.customerName : preview.reward.customerName)}</h3><p dir="ltr" className="mt-1 break-all text-left text-xs opacity-70">{preview.value}</p>
            {preview.kind === "stamp" ? <><dl className={layout.previewStats}><div><dt>{t("رصيد الأختام")} </dt><dd dir="ltr" className="text-xl font-bold">{preview.card.stampsInCycle} / {preview.card.purchasesRequired}</dd></div><div><dt>{t("المكافآت المتاحة")} </dt><dd dir="ltr" className="text-xl font-bold">{preview.card.availableRewards}</dd></div></dl><p className="text-sm leading-7">{t("المكافأة عند الاكتمال:")} {localizedText(locale, preview.card.rewardName, preview.card.catalog?.fields.rewardName)}</p><button type="button" disabled={pending} onClick={() => void processScan(true)} className={layout.confirmButton}>{t("تأكيد الشراء وتسجيل ختم واحد")} </button></> : <><h4 className="mt-2 text-base font-bold">{localizedText(locale, preview.reward.rewardTitle, preview.reward.catalog?.fields.title)}</h4><RastCashierRewardDetails reward={preview.reward} /><p className="mt-2 text-sm font-bold">{remainingText}</p>{validExpiry && <time className="mt-1 block text-sm" dateTime={validExpiry.toISOString()}>{new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(validExpiry)}</time>}{canRedeem ? <button type="button" disabled={pending} onClick={() => void processScan(true)} className={layout.confirmButton}>{t("تأكيد تسليم المكافأة وصرفها")} </button> : <p role="alert" className="mt-4 font-bold">{preview.reward.invalidReason ? errorText(preview.reward.invalidReason) : t("انتهت صلاحية المكافأة")}</p>}</>}
          </section>}
          {noRewards && <RastCashierEmptyRewards />}
          {error && <p ref={errorElement} tabIndex={-1} role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm leading-7 text-red-900 focus-visible:outline-2 focus-visible:outline-offset-4">{errorText(error)}</p>}
          {message && <p role="status" className={layout.readFeedback} data-state={readFeedback?.state ?? "succeeded"}>{readFeedback ? <>{t(readFeedback.label)}<br />{errorText(readFeedback.detail)}</> : t(message)}</p>}
        </section>
        {!points && !preview && !confirmedFinanceFlow && <details className={layout.guide}><summary>{t("ببساطة وبثقة")}</summary><div className={layout.guideContent}><p>{t(kind === "stamp" ? "ثبّت المؤشر داخل الحقل ثم امسح بالقارئ زر الإدخال يحفظ طلب تسجيل ختم واحد" : "ثبّت المؤشر داخل الحقل ثم امسح بالقارئ زر الإدخال يفحص الرمز ويعرض بيانات العميل")} </p>{kind === "stamp" && <p>{t("الحفظ على الجهاز لا يعني اكتمال الختم تابع عدادات المزامنة ولا تمسح بيانات المتصفح قبل اكتمالها")}</p>}<p>{t("المكافأة تُصرف مرة واحدة وتظهر شروطها وصلاحيتها قبل التأكيد")} </p>{!embedded && <Link href={`/loyalty/${identity.slug}${identity.branchId ? `?branch=${encodeURIComponent(identity.branchId)}` : ""}`} className="inline-flex min-h-12 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{t("صفحة عضوية")} {locale === "en" ? identity.nameEn || identity.name : identity.name}</Link>}</div></details>}
      </div>
      {(!points || reads.rows.length > 0) && <section className={layout.readStatus} aria-label={t("حالة المزامنة")}>
        <RastCashierReadSummary rows={reads.rows} />
        {reads.authPaused && <p role="alert" className={layout.readAlert}>{t("توقفت المزامنة تحقق من صلاحية الحساب والخدمة ثم سجّل الدخول بالحساب نفسه لاستكمال القراءات المحفوظة")} {!embedded && <Link href="/cashier/login">{t("تسجيل الدخول")}</Link>}</p>}
        {reads.storageError && <p role="alert" className={layout.readAlert}>{t("تخزين الجهاز غير متاح لا تغلق الصفحة قبل التأكد من حفظ القراءة")}</p>}
      </section>}
      <InvoicePointsHistory queue={invoices} />
      {!embedded && <AnalyticsCouponRedemption phoneCountry={initialData.cafe.phoneCountry} />}
    </div>
  </Container>;
}
