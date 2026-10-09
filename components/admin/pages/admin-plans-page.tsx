"use client";

import { Check, ChevronLeft, Layers3, Plus, Receipt, Save, Trash2 } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { approveSubscriptionRequestAction, rejectSubscriptionRequestAction, savePlatformPlansAction } from "@/app/actions/admin";
import { AdminPageShell } from "@/components/ui/design-system";
import type { BusinessCategoryId } from "@/lib/platform/business-categories";
import { getBrandNavigationFeatures } from "@/lib/platform/feature-access";
import type { PlatformFeature, PlatformPlan, PlanDurationUnit } from "@/lib/platform/admin-data";
import type { SubscriptionPaymentRequest } from "@/lib/platform/subscription";
import styles from "./admin-plans-page.module.css";

type Props = { initialPlans: PlatformPlan[]; initialRequests: SubscriptionPaymentRequest[]; configError?: string };
const durationLabels: Record<PlanDurationUnit, string> = { day: "يوم", month: "شهر", year: "سنة" };
const requestStatusLabels: Record<SubscriptionPaymentRequest["status"], string> = {
  awaiting_receipt: "بانتظار الإيصال", pending_review: "بانتظار المراجعة", approved: "مقبول", rejected: "مرفوض", cancelled: "ملغي",
};
const monthOptions = [1, 2, 12, 24];
const numberFormat = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

function createPlan(categoryId: BusinessCategoryId): PlatformPlan {
  return {
    id: `plan-${crypto.randomUUID().slice(0, 8)}`, name: "باقة جديدة", priceMonthly: 0,
    offerEnabled: false, durationUnit: "month", durationCount: 1, description: "", active: true,
    isDefault: false, features: [], categoryId, maxOrdersMonthly: null, maxProductsMonthly: 20,
    maxBranches: null, trialDays: 0, freeAfterTrial: false, offerLabel: null, offerEndsAt: null,
    durationOptions: [...monthOptions],
  };
}

export function AdminPlansPage({ initialPlans, initialRequests, configError }: Props) {
  const [plans, setPlans] = useState(initialPlans);
  const [requests, setRequests] = useState(initialRequests);
  const [selectedId, setSelectedId] = useState(initialPlans[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const reviewLock = useRef(false);
  const saveLock = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const features = getBrandNavigationFeatures();
  const visiblePlans = plans;
  const plan = visiblePlans.find((item) => item.id === selectedId) ?? visiblePlans[0];
  const pendingCount = requests.filter((request) => request.status === "pending_review").length;
  const isIncluded = (item: PlatformPlan, feature: PlatformFeature) => item.features.includes("all") || item.features.includes(feature);

  function updatePlan(planId: string, patch: Partial<PlatformPlan>) {
    setPlans((current) => current.map((item) => item.id === planId ? { ...item, ...patch } : item));
    setDirty(true);
    setNotice(null);
  }

  function selectDefault(planId: string) {
    const target = plans.find((item) => item.id === planId);
    setPlans((current) => current.map((item) => ({ ...item,
      active: item.id === planId ? true : item.active,
      isDefault: (item.categoryId ?? "cafes_coffee") === (target?.categoryId ?? "cafes_coffee") ? item.id === planId : item.isDefault,
    })));
    setDirty(true);
    setNotice(null);
  }

  function toggleFeature(planId: string, feature: PlatformFeature) {
    const target = plans.find((item) => item.id === planId);
    if (!target) return;
    const explicit: PlatformFeature[] = target.features.includes("all") ? features.map((item) => item.id) : target.features;
    updatePlan(planId, { features: explicit.includes(feature) ? explicit.filter((item) => item !== feature) : [...explicit, feature] });
  }

  function addPlan() {
    const next = createPlan("cafes_coffee");
    setPlans((current) => [...current, next]);
    setSelectedId(next.id);
    setDirty(true);
    setNotice(null);
  }

  function removePlan(planId: string) {
    const target = plans.find((item) => item.id === planId);
    if (!target || target.isDefault) return;
    if (!window.confirm(`حذف «${target.name}» من الباقات؟ سيطبق الحذف عند حفظ التعديلات.`)) return;
    setPlans((current) => current.filter((item) => item.id !== planId));
    setDirty(true);
    setNotice(null);
  }

  async function savePlans(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setNotice(null);
    try {
      setPlans(await savePlatformPlansAction(plans));
      setDirty(false);
      setNotice({ text: "تم حفظ الباقات والخدمات المتاحة لكل باقة", error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "تعذر حفظ الباقات. بقيت تعديلاتك هنا؛ حاول مجددًا.", error: true });
      requestAnimationFrame(() => noticeRef.current?.focus());
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function reviewRequest(requestId: string, approve: boolean) {
    if (reviewLock.current) return;
    const reason = approve ? "" : window.prompt("اكتب سبب رفض الطلب", "تعذر اعتماد الدفع")?.trim();
    if (!approve && !reason) return;
    reviewLock.current = true;
    setReviewingId(requestId);
    try {
      setRequests(approve ? await approveSubscriptionRequestAction(requestId) : await rejectSubscriptionRequestAction(requestId, reason!));
      setNotice({ text: approve ? "تم اعتماد الطلب وتفعيل الباقة" : "تم رفض الطلب", error: false });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "تعذر تحديث الطلب. حاول مجددًا.", error: true });
      requestAnimationFrame(() => noticeRef.current?.focus());
    } finally {
      reviewLock.current = false;
      setReviewingId(null);
    }
  }

  return (
    <div className={styles.page} dir="rtl">
      <AdminPageShell title="الباقات والاشتراكات" subtitle="صمّم الباقة، وحدّد الخدمات التي تظهر للعلامة وتعمل لديها.">
        <div className={styles.summary} aria-label="ملخص الباقات">
          <div><span>الباقات</span><strong>{numberFormat.format(plans.length)}</strong></div>
          <div><span>باقات مفعلة</span><strong>{numberFormat.format(plans.filter((item) => item.active).length)}</strong></div>
          <div><span>خدمات القائمة</span><strong>{numberFormat.format(features.length)}</strong></div>
          <a href="#payment-requests"><span>طلبات للمراجعة</span><strong>{numberFormat.format(pendingCount)}<ChevronLeft size={19} aria-hidden="true" /></strong></a>
        </div>

        {configError ? <div className={styles.error} role="alert">{configError}</div> : null}
        {notice ? <div ref={noticeRef} tabIndex={-1} className={notice.error ? styles.error : styles.success} role={notice.error ? "alert" : "status"}>{notice.text}</div> : null}

        <form onSubmit={savePlans} className={styles.form}>
          <div className={styles.toolbar}>
            <button type="button" className={styles.secondary} onClick={addPlan} disabled={saving}><Plus size={18} aria-hidden="true" />إضافة باقة</button>
          </div>

          <fieldset className={styles.workspace} disabled={saving}>
            <legend className={styles.srOnly}>تحرير الباقات</legend>
            <aside className={styles.planList} aria-label="اختيار الباقة">
              <div className={styles.listHeading}><span>اختر باقة لتحريرها</span><Layers3 size={18} aria-hidden="true" /></div>
              {visiblePlans.map((item) => <button key={item.id} type="button" className={styles.planChoice} aria-pressed={plan?.id === item.id} onClick={() => setSelectedId(item.id)}>
                <span className={styles.choiceTop}><span className={item.active ? styles.enabled : styles.disabled}>{item.active ? "مفعلة" : "متوقفة"}</span>{item.isDefault ? <span className={styles.defaultBadge}>الأساسية</span> : null}</span>
                <strong>{item.name || "باقة دون اسم"}</strong>
                <span className={styles.price}>{numberFormat.format(item.offerEnabled && item.offerPrice !== undefined ? item.offerPrice : item.priceMonthly)} <small>ر.س / {item.durationCount} {durationLabels[item.durationUnit]}</small></span>
                <span className={styles.choiceBottom}>{numberFormat.format(features.filter((feature) => isIncluded(item, feature.id)).length)} خدمات مفعلة<ChevronLeft size={17} aria-hidden="true" /></span>
              </button>)}
              {!visiblePlans.length ? <p className={styles.empty}>لا توجد باقات. أضف أول باقة لتحديد خدماتها.</p> : null}
            </aside>

            {plan ? <fieldset disabled={plan.id === "owner_trial_7d"} className={styles.editor} aria-label={`تحرير ${plan.name}`}>
              <header className={styles.editorHeader}>
                <div><span className={styles.eyebrow}>إعداد الباقة</span><h2>{plan.name || "باقة دون اسم"}</h2><p>{plan.id === "owner_trial_7d" ? "تجربة ثابتة للحسابات الجديدة: 7 أيام للمنيو والإعدادات. متاحة مرة واحدة ولا تُعدّل من هنا." : "التغييرات لا تطبق إلا بعد الحفظ."}</p></div>
                <label className={styles.toggle}><input type="checkbox" checked={plan.active} onChange={(event) => updatePlan(plan.id, { active: event.target.checked })} />الباقة مفعلة</label>
              </header>

              <section className={styles.section} aria-labelledby="plan-services-title">
                <div className={styles.sectionHeading}><div><h3 id="plan-services-title">الخدمات المتاحة للعلامة</h3><p>نفس خيارات القائمة الجانبية. فعّل فقط ما تتضمنه الباقة.</p></div><span className={styles.count}>{features.filter((feature) => isIncluded(plan, feature.id)).length} / {features.length}</span></div>
                <div className={styles.featureGrid}>{features.map((feature) => {
                  const enabled = isIncluded(plan, feature.id);
                  return <button type="button" key={feature.id} className={styles.feature} aria-pressed={enabled} onClick={() => toggleFeature(plan.id, feature.id)}>
                    <span><strong>{feature.sidebarLabel ?? feature.titleAr}</strong><small>{enabled ? "تظهر في حساب العلامة" : "غير متاحة ضمن هذه الباقة"}</small></span><span className={styles.checkBox} aria-hidden="true">{enabled ? <Check size={17} /> : null}</span>
                  </button>;
                })}</div>
                <p className={styles.policy}>الخدمات غير المفعلة لا تظهر للعميل. عند عدم وجود اشتراك مفعّل، تتوقف خدمات العلامة بما فيها المنيو المستقل.</p>
              </section>

              <section className={styles.section} aria-labelledby="plan-details-title">
                <h3 id="plan-details-title">تفاصيل الباقة</h3>
                <div className={styles.fields}>
                  <label>اسم الباقة<input required maxLength={120} value={plan.name} onChange={(event) => updatePlan(plan.id, { name: event.target.value })} /></label>
                  <label className={styles.fullWidth}>وصف الباقة<textarea rows={3} value={plan.description} onChange={(event) => updatePlan(plan.id, { description: event.target.value })} placeholder="وصف مختصر لما تقدمه هذه الباقة" /></label>
                </div>
              </section>

              <section className={styles.section} aria-labelledby="plan-price-title">
                <h3 id="plan-price-title">السعر ومدة الاشتراك</h3>
                <div className={styles.fields}>
                  <label>السعر شامل الضريبة (ر.س)<input type="number" min={0} max={1000000} step="0.01" required value={plan.priceMonthly} onChange={(event) => updatePlan(plan.id, { priceMonthly: Number(event.target.value) })} /></label>
                  <div className={styles.durationFields}><label>المدة<input type="number" min={1} max={120} required value={plan.durationCount} onChange={(event) => updatePlan(plan.id, { durationCount: Number(event.target.value) })} /></label><label>الوحدة<select value={plan.durationUnit} onChange={(event) => updatePlan(plan.id, { durationUnit: event.target.value as PlanDurationUnit })}>{Object.entries(durationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
                </div>
                <fieldset className={styles.durationOptions}><legend>مدد الاشتراك المتاحة للعميل</legend>{monthOptions.map((months) => <label key={months}><input type="checkbox" checked={(plan.durationOptions?.length ? plan.durationOptions : monthOptions).includes(months)} onChange={(event) => {
                  const current = plan.durationOptions?.length ? plan.durationOptions : monthOptions;
                  const next = event.target.checked ? [...current, months] : current.filter((item) => item !== months);
                  updatePlan(plan.id, { durationOptions: next.length ? [...new Set(next)].sort((a, b) => a - b) : [1] });
                }} />{months === 1 ? "شهر" : months === 2 ? "شهران" : months === 12 ? "سنة" : "سنتان"}</label>)}</fieldset>
                <label className={styles.toggle}><input type="checkbox" checked={plan.offerEnabled} onChange={(event) => updatePlan(plan.id, { offerEnabled: event.target.checked })} />تفعيل سعر عرض</label>
                {plan.offerEnabled ? <div className={styles.offerFields}>
                  <label>سعر العرض شامل الضريبة (ر.س)<input type="number" min={0} max={1000000} step="0.01" required value={plan.offerPrice ?? ""} onChange={(event) => updatePlan(plan.id, { offerPrice: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
                  <label>اسم العرض<input value={plan.offerLabel ?? ""} onChange={(event) => updatePlan(plan.id, { offerLabel: event.target.value || null })} placeholder="مثال: عرض الانطلاق" /></label>
                  <label>انتهاء العرض<input type="date" value={plan.offerEndsAt ?? ""} onChange={(event) => updatePlan(plan.id, { offerEndsAt: event.target.value || null })} /></label>
                </div> : null}
              </section>

              <section className={styles.section} aria-labelledby="plan-limits-title">
                <h3 id="plan-limits-title">حدود المنتجات والتجربة</h3>
                <div className={styles.fields}>
                  <label>عدد المنتجات شهريًا<input type="number" min={0} value={plan.maxProductsMonthly ?? ""} placeholder="غير محدود" onChange={(event) => updatePlan(plan.id, { maxProductsMonthly: event.target.value === "" ? null : Number(event.target.value) })} /><small>اتركه فارغًا للسماح بعدد غير محدود.</small></label>
                  <label>أيام التجربة<input type="number" min={0} value={plan.trialDays ?? ""} placeholder="بدون تجربة" onChange={(event) => updatePlan(plan.id, { trialDays: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                </div>
                <label className={styles.toggle}><input type="checkbox" checked={Boolean(plan.freeAfterTrial)} onChange={(event) => updatePlan(plan.id, { freeAfterTrial: event.target.checked })} />باقة مجانية بديلة بعد انتهاء التجربة</label>
                <div className={styles.editorFooter}>{plan.isDefault ? <span className={styles.defaultBadge}>الباقة الأساسية</span> : <button type="button" className={styles.secondary} onClick={() => selectDefault(plan.id)}>تعيين كباقة أساسية</button>}{!plan.isDefault ? <button type="button" className={styles.dangerButton} onClick={() => removePlan(plan.id)}><Trash2 size={16} aria-hidden="true" />حذف الباقة</button> : null}</div>
              </section>
            </fieldset> : <div className={styles.emptyEditor}><Layers3 size={38} aria-hidden="true" /><h2>ابدأ بباقة تناسب عملاءك</h2><p>أضف باقة، ثم اختر خدماتها وسعرها.</p><button type="button" className={styles.primary} onClick={addPlan}><Plus size={18} aria-hidden="true" />إضافة باقة</button></div>}
          </fieldset>

          <div className={styles.saveBar}><span role="status">{saving ? "جارٍ حفظ الباقات..." : dirty ? "لديك تعديلات لم تحفظ بعد" : "لا توجد تعديلات غير محفوظة"}</span><button type="submit" className={styles.primary} disabled={saving || !dirty || Boolean(configError)}><Save size={18} aria-hidden="true" />{saving ? "جارٍ الحفظ..." : "حفظ جميع التعديلات"}</button></div>
        </form>

        {visiblePlans.length ? <section className={styles.comparison} aria-labelledby="plan-comparison-title"><div className={styles.sectionHeading}><div><h2 id="plan-comparison-title">الخدمات في نظرة واحدة</h2></div></div><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="جدول مقارنة خدمات الباقات"><table><thead><tr><th scope="col">الخدمة</th>{visiblePlans.map((item) => <th scope="col" key={item.id}>{item.name}</th>)}</tr></thead><tbody>{features.map((feature) => <tr key={feature.id}><th scope="row">{feature.sidebarLabel ?? feature.titleAr}</th>{visiblePlans.map((item) => <td key={item.id}><span className={isIncluded(item, feature.id) ? styles.enabled : styles.disabled}>{isIncluded(item, feature.id) ? "مشمولة" : "غير مشمولة"}</span></td>)}</tr>)}</tbody></table></div></section> : null}

        <section id="payment-requests" className={styles.payments} aria-labelledby="payments-title">
          <div className={styles.sectionHeading}><div><h2 id="payments-title"><Receipt size={22} aria-hidden="true" />طلبات الدفع</h2><p>راجع طلبات الاشتراك واعتمد الدفع لتفعيل الباقة.</p></div><span className={styles.count}>{numberFormat.format(pendingCount)} للمراجعة</span></div>
          {requests.map((request) => <article key={request.id} className={styles.request}>
            <div className={styles.requestInfo}><h3>{request.cafeName}</h3><p>{request.planName} · {request.paymentMethod === "card_paypal" ? "دفع بالبطاقة" : "حوالة بنكية"}</p><p>{request.receiptChannel === "whatsapp" ? "الإيصال مرسل عبر واتساب؛ تحقق من استلامه والتحويل قبل الاعتماد." : "تحقق من الإيصال والتحويل قبل اعتماد الطلب."}</p>{request.receiptUrl ? <a href={request.receiptUrl} target="_blank" rel="noreferrer" className={styles.secondary}>عرض إيصال التحويل</a> : null}<time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</time></div>
            <div className={styles.requestAmount}><strong>{numberFormat.format(request.amount)} <small>ر.س</small></strong><span className={request.status === "approved" ? styles.enabled : request.status === "rejected" ? styles.rejected : styles.defaultBadge}>{requestStatusLabels[request.status]}</span></div>
            {request.status === "pending_review" ? <div className={styles.requestActions}><button type="button" className={styles.primary} disabled={reviewingId !== null} onClick={() => reviewRequest(request.id, true)}>{reviewingId === request.id ? "جارٍ تحديث الطلب…" : "اعتماد وتفعيل الباقة"}</button><button type="button" className={styles.dangerButton} disabled={reviewingId !== null} onClick={() => reviewRequest(request.id, false)}>رفض الطلب</button></div> : null}
          </article>)}
          {!requests.length ? <p className={styles.empty}>لا توجد طلبات دفع حاليًا. ستظهر الطلبات الجديدة هنا للمراجعة.</p> : null}
        </section>
      </AdminPageShell>
    </div>
  );
}
