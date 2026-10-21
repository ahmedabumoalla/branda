"use client";

import { ArrowUpLeft, Check, Clock3, CreditCard, Download, ExternalLink, Layers3, MessageCircle, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";
import { DashboardPageShell } from "@/components/ui/design-system";
import type { PlatformPlan } from "@/lib/platform/admin-data";
import { getBrandNavigationFeatures, type EffectiveBrandFeatureAccess } from "@/lib/platform/feature-access";
import { calculateSubscriptionPricing, formatSubscriptionDuration, getPlanDurationOptions, getPlanMonthlyAmount, isPurchasablePlan } from "@/lib/platform/subscription-durations";
import { subscriptionWhatsappUrl, type BankSubscriptionRequest, type BankTransferDetails, type CurrentSubscription } from "@/lib/platform/subscription-bank";
import type { PendingSubscription, SubscriptionRecord } from "@/lib/platform/subscription";
import { createBankSubscriptionRequestAction, previewBankSubscriptionAction, refreshSubscriptionRequestsAction, submitSubscriptionWhatsappAction, uploadSubscriptionReceiptAction } from "@/app/actions/subscription";
import type { BankSubscriptionQuote } from "@/lib/data/subscription";
import type { ActionResult } from "@/lib/platform/action-result";
import styles from "./subscription-page.module.css";

type Props = {
  initialPlans: PlatformPlan[]; initialActivePlanId: string; initialHistory: SubscriptionRecord[];
  initialPending: PendingSubscription | null; initialFeatureAccess: EffectiveBrandFeatureAccess[];
  currentSubscription: CurrentSubscription | null; bankDetails: BankTransferDetails | null;
  currentSubscriptions?: CurrentSubscription[];
  initialRequests: BankSubscriptionRequest[]; customerName: string; referenceTime: number; configError?: string;
};
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh" }) : "غير محدد";
const statuses: Record<string, string> = { awaiting_receipt: "بانتظار الإيصال", pending_review: "قيد مراجعة التحويل", approved: "تم الاعتماد", rejected: "ملغي بعد الرفض", cancelled: "ملغي" };

function UpgradeSummary({ quote }: { quote: { upgradeCreditAmount?: number; upgradeCredits?: BankSubscriptionQuote["upgradeCredits"]; extendedDays?: number; totalAmount: number } }) {
  return <section className={styles.upgradeSummary} aria-label="تفاصيل رصيد الترقية">
    <div className={styles.upgradeHeading}><span className={styles.eyebrow}>قيمة باقاتك مستمرة معك</span><h3>ترقية أذكى إلى برندة بلس</h3><p>نحتسب الأيام التي لم تستخدمها ونحوّل قيمتها إلى اشتراكك الجديد</p></div>
    <div className={styles.creditRows}>{quote.upgradeCredits?.map(item => <div className={styles.creditRow} key={item.subscriptionId}>
      <div><strong>{item.planName}</strong><span>{money.format(item.remainingDays)} يوم متبقٍ من {money.format(item.totalDays)} يوم</span><small>{money.format(item.paidAmount)} ر.س ÷ {money.format(item.totalDays)} يوم × {money.format(item.remainingDays)} يوم</small></div><strong>{money.format(item.creditAmount)} <small>ر.س</small></strong>
    </div>)}</div>
    {(quote.extendedDays ?? 0) > 0 ? <p className={styles.creditExtra}>رصيدك يغطي السعر ويضيف {money.format(quote.extendedDays ?? 0)} يوم إلى مدة بلس</p> : null}
    <p className={styles.creditFootnote}>الحساب من المبلغ المدفوع فعليًا على أساس ٣٠ يومًا للشهر وتبقى باقاتك متاحة حتى اعتماد الترقية</p>
  </section>;
}

export function SubscriptionPageClient({ initialPlans: plans, initialActivePlanId, initialHistory, initialFeatureAccess, currentSubscription, currentSubscriptions, bankDetails, initialRequests, customerName, referenceTime, configError }: Props) {
  const router = useRouter();
  const purchasablePlans = plans.filter(isPurchasablePlan);
  const [selectedId, setSelectedId] = useState(purchasablePlans.find(plan => plan.id === initialActivePlanId)?.id || purchasablePlans[0]?.id || "");
  const [months, setMonths] = useState(getPlanDurationOptions(plans.find(plan => plan.id === selectedId))[0]?.months ?? 1);
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<BankSubscriptionQuote | null>(null);
  const [baseQuote, setBaseQuote] = useState<{ key: string; data: BankSubscriptionQuote | null; error?: string } | null>(null);
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const quoteVersion = useRef(0);
  const couponLock = useRef(false);
  const pendingLock = useRef(false);
  const checkoutRef = useRef<HTMLElement>(null);
  const activePlan = plans.find(plan => plan.id === initialActivePlanId);
  const subscriptions = (currentSubscriptions ?? (currentSubscription ? [currentSubscription] : [])).filter(item => (!item.startedAt || Date.parse(item.startedAt) <= referenceTime) && (!item.expiresAt || Date.parse(item.expiresAt) > referenceTime));
  const activePlanIds = new Set(subscriptions.map(item => item.planId));
  const selected = plans.find(plan => plan.id === selectedId);
  const openRequest = requests.find(request => ["awaiting_receipt", "pending_review"].includes(request.status));
  const requestPlan = plans.find(plan => plan.id === openRequest?.planId);
  const catalog = getBrandNavigationFeatures();
  const activeFeatures = initialFeatureAccess.filter(row => row.effectiveEnabled && catalog.some(feature => feature.id === row.feature.id));
  const expires = currentSubscription?.expiresAt ? new Date(currentSubscription.expiresAt).getTime() : null;
  const daysRemaining = expires === null ? null : Math.max(0, Math.ceil((expires - referenceTime) / 86400000));
  const active = subscriptions.length > 0;
  const includesLoyalty = (plan?: PlatformPlan) => Boolean(plan?.features.includes("all") || plan?.features.includes("loyalty"));
  const pricing = selected ? calculateSubscriptionPricing(selected, months) : null;
  const quoteKey = `${selectedId}:${months}:${quoteRefresh}`;
  const verifiedQuote = quote ?? (baseQuote?.key === quoteKey ? baseQuote.data : null);
  const quoteError = baseQuote?.key === quoteKey ? baseQuote.error : undefined;
  const amount = verifiedQuote?.totalAmount ?? pricing?.totalAmount ?? 0;
  useEffect(() => {
    if (!selectedId || openRequest || configError) return;
    let cancelled = false;
    previewBankSubscriptionAction(selectedId, months).then(result => {
      if (!cancelled) setBaseQuote({ key: quoteKey, data: result.ok ? result.data : null, error: result.ok ? undefined : result.message });
    }).catch(() => {
      if (!cancelled) setBaseQuote({ key: quoteKey, data: null, error: "تعذر احتساب السعر حاول مجددًا" });
    });
    return () => { cancelled = true; };
  }, [selectedId, months, quoteKey, openRequest, configError]);
  function invalidateCoupon() { quoteVersion.current++; setQuote(null); setMessage(null); }
  async function applyCoupon() {
    if (!selected || couponLock.current || !couponCode.trim()) return;
    couponLock.current = true; setCheckingCoupon(true); setMessage(null);
    const version = quoteVersion.current;
    try {
      const result = await previewBankSubscriptionAction(selected.id, months, couponCode);
      if (quoteVersion.current !== version) return;
      if (!result.ok) { setQuote(null); setMessage({ text: result.message, error: true }); return; }
      setQuote(result.data); setMessage({ text: "تم تطبيق الكوبون على المبلغ بعد خصم السنة إن وجد", error: false });
    } catch { if (quoteVersion.current === version) setMessage({ text: "تعذر التحقق من الكوبون حاول مجددًا", error: true }); }
    finally { couponLock.current = false; setCheckingCoupon(false); }
  }

  function selectPlan(plan: PlatformPlan, durationMonths = getPlanDurationOptions(plan)[0]?.months ?? 1) {
    invalidateCoupon();
    setSelectedId(plan.id);
    setMonths(durationMonths);
    setMessage(null);
    checkoutRef.current?.focus({ preventScroll: true });
    checkoutRef.current?.scrollIntoView({ block: "start" });
  }
  async function run(action: () => Promise<ActionResult<BankSubscriptionRequest[]>>, success: string) {
    if (pendingLock.current) return;
    pendingLock.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) { setMessage({ text: result.message, error: true }); setQuote(null); setQuoteRefresh(value => value + 1); return; }
      const nextRequests = result.data;
      setRequests(nextRequests);
      setMessage({ text: success, error: false });
      if (openRequest && nextRequests.some(request => request.id === openRequest.id && request.status === "approved")) {
        clearDashboardShellSnapshot();
        window.dispatchEvent(new Event("barndaksa:subscription-updated"));
        router.refresh();
      }
    }
    catch { setMessage({ text: "تعذر الاتصال لإكمال الطلب حاول مجددًا", error: true }); }
    finally { pendingLock.current = false; setBusy(false); }
  }
  async function uploadReceipt() {
    if (!openRequest || !receipt) return;
    if (receipt.size > 5 * 1024 * 1024) { setMessage({ text: "حجم الإيصال يتجاوز 5 ميجابايت", error: true }); return; }
    const payload = new FormData(); payload.set("receipt", receipt);
    await run(() => uploadSubscriptionReceiptAction(openRequest.id, payload), "وصل إيصالك للمراجعة لا يلزم إرسال طلب آخر");
  }

  return <div className={styles.page} dir="rtl"><DashboardPageShell title="الباقات والاشتراكات" subtitle="اختر خدمات علامتك واجمع أكثر من باقة في الوقت نفسه">
    {!active && <section role="status" className={styles.currentIdentity}><p>انتهت مدة باقتك فعّل اشتراكك لاستعادة خدمات اللوحة أو تواصل معنا للمساعدة</p><a href="https://wa.me/966508424401" target="_blank" rel="noopener noreferrer" className={styles.lightButton}><MessageCircle size={17} aria-hidden="true" />تواصل معنا عبر واتساب <span dir="ltr">0508424401</span></a></section>}
    {configError ? <p role="alert" className={styles.error}>{configError}</p> : null}
    <section className={styles.current} aria-labelledby="current-plan-title">
      <div className={styles.currentIdentity}><span className={styles.eyebrow}>اشتراكات علامتك</span><h2 id="current-plan-title">{active ? subscriptions.length > 1 ? `${money.format(subscriptions.length)} باقات تعمل معًا` : activePlan?.name ?? subscriptions[0]?.planName : "انتهى اشتراككم مع برندة"}</h2><p>{active ? currentSubscription?.awaitingOwnerDelivery ? "خدمات التجربة جاهزة وتبدأ المدة بعد إرسال تفاصيل الدخول للمالك" : currentSubscription?.status === "trialing" ? "أنت الآن في الفترة التجريبية" : "كل باقة بمدة مستقلة ويمكنك إضافة خدمات جديدة في أي وقت" : "اختر باقة لتفعيل خدمات علامتك والمنيو المستقل"}</p><a href="#available-plans" className={styles.lightButton}>{active ? "استعراض الباقات والترقية" : "اختر باقتك"}<Layers3 size={17} aria-hidden="true" /></a></div>
      <div className={styles.currentDetails}><div><span>{subscriptions.length > 1 ? "المدة المتبقية لأحدث باقة" : "المدة المتبقية"}</span><strong>{active ? currentSubscription?.awaitingOwnerDelivery ? "٧ أيام بعد الإرسال" : daysRemaining === null ? "غير محددة" : `${money.format(daysRemaining)} يوم` : "—"}</strong></div><div><span>تاريخ انتهاء الاشتراك</span><strong>{active ? currentSubscription?.awaitingOwnerDelivery ? "العداد لم يبدأ" : date(currentSubscription?.expiresAt) : "—"}</strong></div><div className={styles.currentServices}><span>الخدمات المفعلة</span><div>{active && activeFeatures.length ? activeFeatures.map(row => <span key={row.feature.id}><Check size={13} aria-hidden="true" />{row.feature.sidebarLabel ?? row.feature.titleAr}</span>) : <span>لا توجد خدمات مفعلة</span>}</div></div></div>
    </section>

    {subscriptions.length > 1 ? <section className={styles.subscriptionList} aria-label="الباقات المفعلة">{subscriptions.map(item => <article key={item.id}><span className={styles.eyebrow}>باقة مفعلة</span><h3>{item.planName ?? plans.find(plan => plan.id === item.planId)?.name}</h3><p>تنتهي في {date(item.expiresAt)}</p></article>)}</section> : null}

    <section id="available-plans" className={styles.plansSection} aria-labelledby="available-plans-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>اختر ما يناسب علامتك</span><h2 id="available-plans-title">باقات واضحة خدمات تختارها</h2><p>اجمع الباقات التي تحتاجها وكل باقة تحتفظ بمدتها المستقلة</p><p>جميع الأسعار شاملة ضريبة القيمة المضافة</p></div><span className={styles.bankBadge}><ShieldCheck size={17} aria-hidden="true" />تحويل بنكي ومراجعة يدوية</span></div>
      <div className={styles.plans}>{purchasablePlans.map(plan => {
        const annual = calculateSubscriptionPricing(plan, 12);
        const hasAnnualOffer = annual.discountAmount > 0;
        return <article key={plan.id} className={`${styles.plan} ${selectedId === plan.id ? styles.selectedPlan : ""}`}>
        <div className={styles.planTop}><Layers3 size={22} aria-hidden="true" />{activePlanIds.has(plan.id) ? <span>باقتك الحالية</span> : selectedId === plan.id ? <span>الباقة المختارة</span> : null}</div><h3>{plan.name}</h3><p>{plan.description || "خدمات واضحة لإدارة علامتك"}</p><div className={styles.price}>{money.format(getPlanMonthlyAmount(plan))}<span>ر.س / شهر</span></div>
        {hasAnnualOffer ? <div className={styles.annualOffer} role="group" aria-label={`عرض الاشتراك السنوي لباقة ${plan.name}`}>
          <div className={styles.annualOfferHeading}><span>سنة كاملة بتوفير أكبر</span><strong className={styles.annualBadge}>خصم {money.format(annual.discountPercent)}٪</strong></div>
          <div className={styles.annualOriginal}><span>بدلًا من</span><del>{money.format(annual.baseAmount)} ر.س</del></div>
          <div className={styles.annualPrice}><strong>{money.format(annual.totalAmount)}</strong><span>ر.س / سنة</span></div>
          <p className={styles.annualSaving}>توفر <strong>{money.format(annual.discountAmount)} ر.س</strong> مع الاشتراك السنوي</p>
          <span className={styles.annualPayment}>دفعة واحدة مقابل ١٢ شهرًا شامل الضريبة</span>
          <button className={styles.annualButton} type="button" disabled={busy || Boolean(configError)} onClick={() => selectPlan(plan, 12)} aria-label={`اختيار الاشتراك السنوي لباقة ${plan.name}`}>اختيار الاشتراك السنوي<ArrowUpLeft size={18} aria-hidden="true" /></button>
        </div> : null}
        <ul>{catalog.map(feature => { const included = plan.features.includes("all") || plan.features.includes(feature.id); return <li key={feature.id} className={included ? styles.included : styles.excluded}><span aria-hidden="true">{included ? "✓" : "—"}</span>{feature.sidebarLabel ?? feature.titleAr}<span className={styles.srOnly}>{included ? "مشمولة" : "غير مشمولة"}</span></li>; })}</ul>
        <button className={selectedId === plan.id && !hasAnnualOffer ? styles.primary : styles.secondary} type="button" onClick={() => selectPlan(plan)} disabled={busy || Boolean(configError)}>{hasAnnualOffer ? "اختيار الاشتراك الشهري" : activePlanIds.has(plan.id) ? "تجديد الباقة" : "اختيار الباقة"}</button>
      </article>})}</div>{!purchasablePlans.length && !configError ? <p className={styles.empty}>لا توجد باقات متاحة حاليًا تواصل معنا لمساعدتك</p> : null}
    </section>

    <section ref={checkoutRef} tabIndex={-1} className={styles.checkout} aria-labelledby="checkout-title">
      <div className={styles.checkoutMain}><span className={styles.eyebrow}>خطوة واحدة قبل التفعيل</span><h2 id="checkout-title">{openRequest ? "إكمال طلب الاشتراك" : "طلب الاشتراك بالتحويل البنكي"}</h2>
        <p className={styles.hint}>يتم التفعيل بعد مراجعة التحويل واعتماده من الإدارة خلال 24 ساعة{includesLoyalty(openRequest ? requestPlan : selected) ? " تجهيز خدمة الولاء خلال 72 ساعة من اعتماد التحويل" : ""}</p>
        {message ? <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.success}>{message.text}</p> : null}
        {openRequest ? <><div className={styles.requestSummary}><strong>{openRequest.planName}</strong><span>{formatSubscriptionDuration(openRequest.durationMonths)} · {money.format(openRequest.amount)} ر.س</span><span className={styles.requestStatus}>{statuses[openRequest.status]}</span></div>{openRequest.upgradeCredits?.length ? <UpgradeSummary quote={{ ...openRequest, totalAmount: openRequest.amount }} /> : null}{openRequest.couponCode ? <p className={styles.hint}>كوبون <b dir="ltr">{openRequest.couponCode}</b> خصم {money.format(openRequest.couponDiscountAmount ?? 0)} ر.س بعد خصم السنة {money.format(openRequest.annualDiscountAmount ?? 0)} ر.س</p> : null}<p className={styles.requestId}>رقم الطلب <b dir="ltr">{openRequest.id}</b></p>
          {openRequest.status === "awaiting_receipt" ? <div className={styles.receiptOptions}>
            <div><h3><Upload size={18} aria-hidden="true" />ارفع إيصال التحويل</h3><p>صورة واضحة أو ملف PDF حتى 5 ميجابايت</p><label className={styles.fileInput}>اختيار الإيصال<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={event => setReceipt(event.target.files?.[0] ?? null)} /></label>{receipt ? <p className={styles.fileName}>{receipt.name}</p> : null}<button type="button" className={styles.primary} disabled={!receipt || busy} onClick={uploadReceipt}>{busy ? "جارٍ الإرسال" : "إرسال الإيصال للمراجعة"}</button></div>
            <div><h3><MessageCircle size={18} aria-hidden="true" />أو أرسله عبر واتساب</h3><p>أرسل الإيصال مع اسمك واسم الباقة ورقم الطلب</p><a href={subscriptionWhatsappUrl(customerName, openRequest.planName, openRequest.id)} target="_blank" rel="noreferrer" className={styles.secondary}>فتح واتساب<ExternalLink size={15} aria-hidden="true" /></a><label className={styles.confirmation}><input type="checkbox" checked={whatsappSent} disabled={busy} onChange={event => setWhatsappSent(event.target.checked)} />أرسلت إيصال التحويل عبر واتساب</label><button className={styles.secondary} type="button" disabled={!whatsappSent || busy} onClick={() => run(() => submitSubscriptionWhatsappAction(openRequest.id), "تم إرسال طلبك للمراجعة ستتحقق الإدارة من إيصال واتساب قبل التفعيل")}>إشعار الإدارة للمراجعة</button></div>
          </div> : <div className={styles.reviewNotice}><Clock3 size={26} aria-hidden="true" /><div><h3>طلبك لدى فريق المراجعة</h3><p>{openRequest.amount === 0 ? (openRequest.upgradeCreditAmount ? "رصيد باقاتك يغطي الترقية بالكامل لا تحتاج إلى تحويل بنكي وستتفعّل بلس بعد اعتماد الطلب" : "لا يوجد مبلغ تحويل وسيتم تفعيل الاشتراك بعد اعتماد الطلب") : "إرسال الإيصال لا يفعّل الباقة تلقائيًا ستظهر الباقة بعد اعتماد التحويل"}</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => run(() => refreshSubscriptionRequestsAction(), "تم تحديث حالة الطلب إذا اعتمدت الباقة حدّث الصفحة لعرض خدماتها")}>تحديث حالة الطلب</button></div></div>}
        </> : selected ? <div className={styles.orderForm}><label>الباقة المختارة<select value={selectedId} disabled={busy} onChange={event => { const next = plans.find(plan => plan.id === event.target.value); if (next) selectPlan(next); }}>{purchasablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label>مدة الاشتراك<select value={months} disabled={busy} onChange={event => { invalidateCoupon(); setMonths(Number(event.target.value)); }}>{getPlanDurationOptions(selected).map(option => <option value={option.months} key={option.months}>{option.label}</option>)}</select></label><div className={styles.couponField}><label htmlFor="subscription-coupon">لديك كوبون خصم</label><div><input id="subscription-coupon" dir="ltr" maxLength={40} value={couponCode} disabled={busy} placeholder="أدخل الكود" onChange={event => { invalidateCoupon(); setCouponCode(event.target.value.toUpperCase()); }} /><button type="button" className={styles.secondary} disabled={busy || checkingCoupon || !couponCode.trim() || Boolean(configError)} onClick={applyCoupon}>{checkingCoupon ? "جارٍ التحقق" : "تطبيق الكوبون"}</button></div><small>قد يخصص الكوبون لباقات أو مدد اشتراك محددة</small></div>
          {verifiedQuote?.upgradeCredits?.length ? <UpgradeSummary quote={verifiedQuote} /> : selected.isUpgradeBundle ? <p className={styles.quoteNote}>يُخصم رصيد الأيام المتبقية من الباقات المدفوعة المشمولة في بلس تلقائيًا</p> : null}
          {quoteError ? <div className={styles.quoteNote} role="alert"><p>{quoteError}</p><button type="button" className={styles.secondary} onClick={() => { invalidateCoupon(); setQuoteRefresh(value => value + 1); }}>إعادة احتساب السعر</button></div> : !verifiedQuote ? <p className={styles.quoteNote} role="status">جارٍ احتساب السعر ورصيد اشتراكاتك</p> : null}
          <dl className={styles.priceBreakdown}><div><dt>السعر الأساسي</dt><dd>{money.format(verifiedQuote?.baseAmount ?? pricing?.baseAmount ?? 0)} ر.س</dd></div>{(verifiedQuote?.annualDiscountAmount ?? pricing?.discountAmount ?? 0) > 0 ? <div><dt>خصم الاشتراك السنوي</dt><dd>− {money.format(verifiedQuote?.annualDiscountAmount ?? pricing?.discountAmount ?? 0)} ر.س</dd></div> : null}{quote?.couponCode ? <div><dt>خصم الكوبون <b dir="ltr">{quote.couponCode}</b></dt><dd>− {money.format(quote.couponDiscountAmount)} ر.س</dd></div> : null}{(verifiedQuote?.upgradeCreditAmount ?? 0) > 0 ? <div><dt>خصم رصيد الباقات الحالية</dt><dd>− {money.format(verifiedQuote?.upgradeCreditAmount ?? 0)} ر.س</dd></div> : null}</dl><div className={styles.total}><span>المبلغ المطلوب شامل الضريبة</span><strong>{verifiedQuote ? money.format(amount) : "—"} <small>ر.س</small></strong></div><button className={styles.primary} type="button" disabled={busy || checkingCoupon || !verifiedQuote || Boolean(configError) || Boolean(couponCode.trim() && !quote)} onClick={() => run(() => createBankSubscriptionRequestAction(selected.id, months, quote?.couponCode ?? undefined, verifiedQuote?.totalAmount, (verifiedQuote?.upgradeCreditAmount ?? 0) + (verifiedQuote?.upgradeExtraCreditAmount ?? 0), verifiedQuote?.extendedSeconds ?? 0), amount === 0 ? "تم إرسال طلب الاشتراك للمراجعة دون مبلغ تحويل" : "تم إنشاء الطلب أرسل إيصال التحويل للمراجعة")}>{busy ? "جارٍ إنشاء الطلب" : amount === 0 && verifiedQuote ? (verifiedQuote.upgradeCreditAmount ? "تأكيد الترقية من رصيد باقاتي" : "تأكيد طلب الاشتراك") : "متابعة وإرسال إيصال التحويل"}</button></div> : null}
      </div>
      <aside className={styles.bankDetails}><CreditCard size={25} aria-hidden="true" /><h3>بيانات التحويل البنكي</h3>{bankDetails ? <dl><div><dt>اسم المستفيد</dt><dd>{bankDetails.beneficiary}</dd></div><div><dt>البنك</dt><dd>{bankDetails.bankName}</dd></div><div><dt>الآيبان</dt><dd dir="ltr">{bankDetails.iban}</dd></div>{bankDetails.accountNumber ? <div><dt>رقم الحساب</dt><dd dir="ltr">{bankDetails.accountNumber}</dd></div> : null}</dl> : <p>اطلب بيانات حساب «العنوان الحصري» من فريقنا عبر واتساب قبل التحويل</p>}<a href={subscriptionWhatsappUrl(customerName, openRequest?.planName ?? selected?.name ?? "الباقة المناسبة")} target="_blank" rel="noreferrer" className={styles.secondary}><MessageCircle size={17} aria-hidden="true" />التواصل عبر واتساب</a><span dir="ltr" className={styles.phone}>0508424401</span><p className={styles.bankNote}>احتفظ بإيصال التحويل اعتماد الإدارة هو ما يفعّل الاشتراك</p></aside>
    </section>

    <section className={styles.history} aria-labelledby="history-title"><h2 id="history-title"><Download size={20} aria-hidden="true" />سجل الاشتراكات والطلبات</h2>{requests.length || initialHistory.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="سجل الاشتراكات"><table><thead><tr><th scope="col">الباقة</th><th scope="col">التاريخ</th><th scope="col">المبلغ</th><th scope="col">الحالة</th></tr></thead><tbody>{requests.map(request => <tr key={request.id}><th scope="row">{request.planName}{request.adminResponse ? <small>{request.adminResponse}</small> : null}</th><td>{date(request.createdAt)}</td><td>{money.format(request.amount)} ر.س</td><td>{statuses[request.status] ?? "قيد المعالجة"}</td></tr>)}{initialHistory.map(record => <tr key={record.id}><th scope="row">{record.planName}</th><td>{date(record.createdAt)}</td><td>{money.format(record.amount)} ر.س</td><td>{record.paymentStatus === "paid" ? "اشتراك مسجل" : "منتهٍ أو ملغي"}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>سيظهر سجل اشتراكاتك وطلباتك هنا</p>}</section>
  </DashboardPageShell></div>;
}
