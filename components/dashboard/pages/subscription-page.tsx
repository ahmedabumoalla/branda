"use client";

import { ArrowUpLeft, Check, Clock3, CreditCard, Download, ExternalLink, Layers3, MessageCircle, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearDashboardShellSnapshot } from "@/lib/performance/dashboard-shell-client";
import { DashboardPageShell } from "@/components/ui/design-system";
import type { PlatformPlan } from "@/lib/platform/admin-data";
import { getBrandNavigationFeatures, type EffectiveBrandFeatureAccess } from "@/lib/platform/feature-access";
import { calculateSubscriptionPricing, formatSubscriptionDuration, getPlanDurationOptions, getPlanMonthlyAmount } from "@/lib/platform/subscription-durations";
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
  initialRequests: BankSubscriptionRequest[]; customerName: string; referenceTime: number; configError?: string;
};
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh" }) : "غير محدد";
const statuses: Record<string, string> = { awaiting_receipt: "بانتظار الإيصال", pending_review: "قيد مراجعة التحويل", approved: "تم الاعتماد", rejected: "مرفوض", cancelled: "ملغي" };

export function SubscriptionPageClient({ initialPlans: plans, initialActivePlanId, initialHistory, initialFeatureAccess, currentSubscription, bankDetails, initialRequests, customerName, referenceTime, configError }: Props) {
  const router = useRouter();
  const purchasablePlans = plans.filter(plan => plan.priceMonthly > 0 && plan.id !== "owner_trial_7d");
  const [selectedId, setSelectedId] = useState(purchasablePlans.find(plan => plan.id === initialActivePlanId)?.id || purchasablePlans[0]?.id || "");
  const [months, setMonths] = useState(getPlanDurationOptions(plans.find(plan => plan.id === selectedId))[0]?.months ?? 1);
  const [requests, setRequests] = useState(initialRequests);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [quote, setQuote] = useState<BankSubscriptionQuote | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const quoteVersion = useRef(0);
  const couponLock = useRef(false);
  const pendingLock = useRef(false);
  const checkoutRef = useRef<HTMLElement>(null);
  const activePlan = plans.find(plan => plan.id === initialActivePlanId);
  const selected = plans.find(plan => plan.id === selectedId);
  const openRequest = requests.find(request => ["awaiting_receipt", "pending_review"].includes(request.status));
  const requestPlan = plans.find(plan => plan.id === openRequest?.planId);
  const catalog = getBrandNavigationFeatures();
  const activeFeatures = initialFeatureAccess.filter(row => row.effectiveEnabled && catalog.some(feature => feature.id === row.feature.id));
  const expires = currentSubscription?.expiresAt ? new Date(currentSubscription.expiresAt).getTime() : null;
  const daysRemaining = expires === null ? null : Math.max(0, Math.ceil((expires - referenceTime) / 86400000));
  const active = Boolean(activePlan && currentSubscription && (expires === null || expires > referenceTime));
  const includesLoyalty = (plan?: PlatformPlan) => Boolean(plan?.features.includes("all") || plan?.features.includes("loyalty"));
  const pricing = selected ? calculateSubscriptionPricing(selected, months) : null;
  const amount = quote?.totalAmount ?? pricing?.totalAmount ?? 0;
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
      if (!result.ok) { setMessage({ text: result.message, error: true }); return; }
      const nextRequests = result.data;
      setRequests(nextRequests);
      setMessage({ text: success, error: false });
      if (openRequest && nextRequests.some(request => request.id === openRequest.id && request.status === "approved")) {
        clearDashboardShellSnapshot();
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

  return <div className={styles.page} dir="rtl"><DashboardPageShell title="الباقات والاشتراكات" subtitle="كل ما تحتاجه لعلامتك في باقة تختارها بنفسك">
    {configError ? <p role="alert" className={styles.error}>{configError}</p> : null}
    <section className={styles.current} aria-labelledby="current-plan-title">
      <div className={styles.currentIdentity}><span className={styles.eyebrow}>اشتراكك الحالي</span><h2 id="current-plan-title">{active ? activePlan?.name : "انتهى اشتراككم مع برندة"}</h2><p>{active ? currentSubscription?.status === "trialing" ? "أنت الآن في الفترة التجريبية" : "خدمات علامتك متاحة حسب باقتك" : "اختر باقة لتفعيل خدمات علامتك والمنيو المستقل"}</p><a href="#available-plans" className={styles.lightButton}>{active ? "استعراض الباقات والترقية" : "اختر باقتك"}<Layers3 size={17} aria-hidden="true" /></a></div>
      <div className={styles.currentDetails}><div><span>المدة المتبقية</span><strong>{active ? daysRemaining === null ? "غير محددة" : `${money.format(daysRemaining)} يوم` : "—"}</strong></div><div><span>تاريخ انتهاء الاشتراك</span><strong>{active ? date(currentSubscription?.expiresAt) : "—"}</strong></div><div className={styles.currentServices}><span>الخدمات المفعلة</span><div>{active && activeFeatures.length ? activeFeatures.map(row => <span key={row.feature.id}><Check size={13} aria-hidden="true" />{row.feature.sidebarLabel ?? row.feature.titleAr}</span>) : <span>لا توجد خدمات مفعلة</span>}</div></div></div>
    </section>

    <section id="available-plans" className={styles.plansSection} aria-labelledby="available-plans-title"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>اختر ما يناسب علامتك</span><h2 id="available-plans-title">باقات واضحة خدمات تختارها</h2><p>جميع الأسعار شاملة ضريبة القيمة المضافة</p></div><span className={styles.bankBadge}><ShieldCheck size={17} aria-hidden="true" />تحويل بنكي ومراجعة يدوية</span></div>
      <div className={styles.plans}>{purchasablePlans.map(plan => {
        const annual = calculateSubscriptionPricing(plan, 12);
        const hasAnnualOffer = annual.discountAmount > 0;
        return <article key={plan.id} className={`${styles.plan} ${selectedId === plan.id ? styles.selectedPlan : ""}`}>
        <div className={styles.planTop}><Layers3 size={22} aria-hidden="true" />{initialActivePlanId === plan.id && active ? <span>باقتك الحالية</span> : selectedId === plan.id ? <span>الباقة المختارة</span> : null}</div><h3>{plan.name}</h3><p>{plan.description || "خدمات واضحة لإدارة علامتك"}</p><div className={styles.price}>{money.format(getPlanMonthlyAmount(plan))}<span>ر.س / شهر</span></div>
        {hasAnnualOffer ? <div className={styles.annualOffer} role="group" aria-label={`عرض الاشتراك السنوي لباقة ${plan.name}`}>
          <div className={styles.annualOfferHeading}><span>سنة كاملة بتوفير أكبر</span><strong className={styles.annualBadge}>خصم {money.format(annual.discountPercent)}٪</strong></div>
          <div className={styles.annualOriginal}><span>بدلًا من</span><del>{money.format(annual.baseAmount)} ر.س</del></div>
          <div className={styles.annualPrice}><strong>{money.format(annual.totalAmount)}</strong><span>ر.س / سنة</span></div>
          <p className={styles.annualSaving}>توفر <strong>{money.format(annual.discountAmount)} ر.س</strong> مع الاشتراك السنوي</p>
          <span className={styles.annualPayment}>دفعة واحدة مقابل ١٢ شهرًا شامل الضريبة</span>
          <button className={styles.annualButton} type="button" disabled={busy || Boolean(configError)} onClick={() => selectPlan(plan, 12)} aria-label={`اختيار الاشتراك السنوي لباقة ${plan.name}`}>اختيار الاشتراك السنوي<ArrowUpLeft size={18} aria-hidden="true" /></button>
        </div> : null}
        <ul>{catalog.map(feature => { const included = plan.features.includes("all") || plan.features.includes(feature.id); return <li key={feature.id} className={included ? styles.included : styles.excluded}><span aria-hidden="true">{included ? "✓" : "—"}</span>{feature.sidebarLabel ?? feature.titleAr}<span className={styles.srOnly}>{included ? "مشمولة" : "غير مشمولة"}</span></li>; })}</ul>
        <button className={selectedId === plan.id && !hasAnnualOffer ? styles.primary : styles.secondary} type="button" onClick={() => selectPlan(plan)} disabled={busy || Boolean(configError)}>{hasAnnualOffer ? "اختيار الاشتراك الشهري" : initialActivePlanId === plan.id && active ? "تجديد الباقة" : "اختيار الباقة"}</button>
      </article>})}</div>{!purchasablePlans.length && !configError ? <p className={styles.empty}>لا توجد باقات متاحة حاليًا تواصل معنا لمساعدتك</p> : null}
    </section>

    <section ref={checkoutRef} tabIndex={-1} className={styles.checkout} aria-labelledby="checkout-title">
      <div className={styles.checkoutMain}><span className={styles.eyebrow}>خطوة واحدة قبل التفعيل</span><h2 id="checkout-title">{openRequest ? "إكمال طلب الاشتراك" : "طلب الاشتراك بالتحويل البنكي"}</h2>
        <p className={styles.hint}>يتم التفعيل بعد مراجعة التحويل واعتماده من الإدارة خلال 24 ساعة{includesLoyalty(openRequest ? requestPlan : selected) ? " تجهيز خدمة الولاء خلال 72 ساعة من اعتماد التحويل" : ""}</p>
        {message ? <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.success}>{message.text}</p> : null}
        {openRequest ? <><div className={styles.requestSummary}><strong>{openRequest.planName}</strong><span>{formatSubscriptionDuration(openRequest.durationMonths)} · {money.format(openRequest.amount)} ر.س</span><span className={styles.requestStatus}>{statuses[openRequest.status]}</span></div>{openRequest.couponCode ? <p className={styles.hint}>كوبون <b dir="ltr">{openRequest.couponCode}</b> خصم {money.format(openRequest.couponDiscountAmount ?? 0)} ر.س بعد خصم السنة {money.format(openRequest.annualDiscountAmount ?? 0)} ر.س</p> : null}<p className={styles.requestId}>رقم الطلب <b dir="ltr">{openRequest.id}</b></p>
          {openRequest.status === "awaiting_receipt" ? <div className={styles.receiptOptions}>
            <div><h3><Upload size={18} aria-hidden="true" />ارفع إيصال التحويل</h3><p>صورة واضحة أو ملف PDF حتى 5 ميجابايت</p><label className={styles.fileInput}>اختيار الإيصال<input type="file" accept="image/jpeg,image/png,application/pdf" disabled={busy} onChange={event => setReceipt(event.target.files?.[0] ?? null)} /></label>{receipt ? <p className={styles.fileName}>{receipt.name}</p> : null}<button type="button" className={styles.primary} disabled={!receipt || busy} onClick={uploadReceipt}>{busy ? "جارٍ الإرسال" : "إرسال الإيصال للمراجعة"}</button></div>
            <div><h3><MessageCircle size={18} aria-hidden="true" />أو أرسله عبر واتساب</h3><p>أرسل الإيصال مع اسمك واسم الباقة ورقم الطلب</p><a href={subscriptionWhatsappUrl(customerName, openRequest.planName, openRequest.id)} target="_blank" rel="noreferrer" className={styles.secondary}>فتح واتساب<ExternalLink size={15} aria-hidden="true" /></a><label className={styles.confirmation}><input type="checkbox" checked={whatsappSent} disabled={busy} onChange={event => setWhatsappSent(event.target.checked)} />أرسلت إيصال التحويل عبر واتساب</label><button className={styles.secondary} type="button" disabled={!whatsappSent || busy} onClick={() => run(() => submitSubscriptionWhatsappAction(openRequest.id), "تم إرسال طلبك للمراجعة ستتحقق الإدارة من إيصال واتساب قبل التفعيل")}>إشعار الإدارة للمراجعة</button></div>
          </div> : <div className={styles.reviewNotice}><Clock3 size={26} aria-hidden="true" /><div><h3>طلبك لدى فريق المراجعة</h3><p>إرسال الإيصال لا يفعّل الباقة تلقائيًا ستظهر الباقة بعد اعتماد التحويل</p><button type="button" className={styles.secondary} disabled={busy} onClick={() => run(() => refreshSubscriptionRequestsAction(), "تم تحديث حالة الطلب إذا اعتمدت الباقة حدّث الصفحة لعرض خدماتها")}>تحديث حالة الطلب</button></div></div>}
        </> : selected ? <div className={styles.orderForm}><label>الباقة المختارة<select value={selectedId} disabled={busy} onChange={event => { const next = plans.find(plan => plan.id === event.target.value); if (next) selectPlan(next); }}>{purchasablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label><label>مدة الاشتراك<select value={months} disabled={busy} onChange={event => { invalidateCoupon(); setMonths(Number(event.target.value)); }}>{getPlanDurationOptions(selected).map(option => <option value={option.months} key={option.months}>{option.label}</option>)}</select></label><div className={styles.couponField}><label htmlFor="subscription-coupon">لديك كوبون خصم</label><div><input id="subscription-coupon" dir="ltr" maxLength={40} value={couponCode} disabled={busy} placeholder="أدخل الكود" onChange={event => { invalidateCoupon(); setCouponCode(event.target.value.toUpperCase()); }} /><button type="button" className={styles.secondary} disabled={busy || checkingCoupon || !couponCode.trim() || Boolean(configError)} onClick={applyCoupon}>{checkingCoupon ? "جارٍ التحقق" : "تطبيق الكوبون"}</button></div><small>قد يخصص الكوبون لباقات أو مدد اشتراك محددة</small></div>
          <dl className={styles.priceBreakdown}><div><dt>السعر الأساسي</dt><dd>{money.format(quote?.baseAmount ?? pricing?.baseAmount ?? 0)} ر.س</dd></div>{(quote?.annualDiscountAmount ?? pricing?.discountAmount ?? 0) > 0 ? <div><dt>خصم الاشتراك السنوي</dt><dd>− {money.format(quote?.annualDiscountAmount ?? pricing?.discountAmount ?? 0)} ر.س</dd></div> : null}{quote ? <div><dt>خصم الكوبون <b dir="ltr">{quote.couponCode}</b></dt><dd>− {money.format(quote.couponDiscountAmount)} ر.س</dd></div> : null}</dl><div className={styles.total}><span>الإجمالي شامل الضريبة</span><strong>{money.format(amount)} <small>ر.س</small></strong></div><button className={styles.primary} type="button" disabled={busy || checkingCoupon || Boolean(configError) || Boolean(couponCode.trim() && !quote)} onClick={() => run(() => createBankSubscriptionRequestAction(selected.id, months, quote?.couponCode ?? undefined), "تم إنشاء الطلب أرسل إيصال التحويل للمراجعة")}>{busy ? "جارٍ إنشاء الطلب" : "متابعة وإرسال إيصال التحويل"}</button></div> : null}
      </div>
      <aside className={styles.bankDetails}><CreditCard size={25} aria-hidden="true" /><h3>بيانات التحويل البنكي</h3>{bankDetails ? <dl><div><dt>اسم المستفيد</dt><dd>{bankDetails.beneficiary}</dd></div><div><dt>البنك</dt><dd>{bankDetails.bankName}</dd></div><div><dt>الآيبان</dt><dd dir="ltr">{bankDetails.iban}</dd></div>{bankDetails.accountNumber ? <div><dt>رقم الحساب</dt><dd dir="ltr">{bankDetails.accountNumber}</dd></div> : null}</dl> : <p>اطلب بيانات حساب «العنوان الحصري» من فريقنا عبر واتساب قبل التحويل</p>}<a href={subscriptionWhatsappUrl(customerName, openRequest?.planName ?? selected?.name ?? "الباقة المناسبة")} target="_blank" rel="noreferrer" className={styles.secondary}><MessageCircle size={17} aria-hidden="true" />التواصل عبر واتساب</a><span dir="ltr" className={styles.phone}>0508424401</span><p className={styles.bankNote}>احتفظ بإيصال التحويل اعتماد الإدارة هو ما يفعّل الاشتراك</p></aside>
    </section>

    <section className={styles.history} aria-labelledby="history-title"><h2 id="history-title"><Download size={20} aria-hidden="true" />سجل الاشتراكات والطلبات</h2>{requests.length || initialHistory.length ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="سجل الاشتراكات"><table><thead><tr><th scope="col">الباقة</th><th scope="col">التاريخ</th><th scope="col">المبلغ</th><th scope="col">الحالة</th></tr></thead><tbody>{requests.map(request => <tr key={request.id}><th scope="row">{request.planName}{request.adminResponse ? <small>{request.adminResponse}</small> : null}</th><td>{date(request.createdAt)}</td><td>{money.format(request.amount)} ر.س</td><td>{statuses[request.status] ?? "قيد المعالجة"}</td></tr>)}{initialHistory.map(record => <tr key={record.id}><th scope="row">{record.planName}</th><td>{date(record.createdAt)}</td><td>{money.format(record.amount)} ر.س</td><td>{record.paymentStatus === "paid" ? "اشتراك مسجل" : "منتهٍ أو ملغي"}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>سيظهر سجل اشتراكاتك وطلباتك هنا</p>}</section>
  </DashboardPageShell></div>;
}
