"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, CalendarDays, Check, Copy, Percent, Plus, Search, Ticket, Trash2 } from "lucide-react";
import { deletePlatformDiscountCouponAction, savePlatformDiscountCouponAction } from "@/app/actions/admin";
import type { PlatformDiscountCoupon } from "@/lib/data/platform-coupons";
import type { PlatformPlan } from "@/lib/platform/admin-data";
import type { ActionResult } from "@/lib/platform/action-result";
import { AdminPageShell } from "@/components/ui/design-system";
import { exportRowsToExcel, exportRowsToPdf } from "@/lib/export/admin-report-export";
import { couponSaudiDate, couponStatus, couponStatusLabels } from "@/lib/platform/coupon-status";
import { DEFAULT_SUBSCRIPTION_DURATIONS, formatSubscriptionDuration } from "@/lib/platform/subscription-durations";
import styles from "./admin-platform-coupons-page.module.css";

type Draft = Omit<PlatformDiscountCoupon, "createdAt" | "redeemedCount">;
type Props = { coupons: PlatformDiscountCoupon[]; plans: PlatformPlan[]; configError?: string; referenceTime?: number };
const number = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
function emptyCoupon(): Draft {
  return { id: crypto.randomUUID(), code: "", title: "", discountPercent: 10, eligiblePlanIds: [], eligibleDurationMonths: [1, 3, 6, 12], active: true };
}

function CouponDateField({ id, label, value, min, required, hint, onChange }: {
  id: string; label: string; value?: string; min?: string; required?: boolean; hint: string; onChange: (value: string | undefined) => void;
}) {
  return <div className={styles.dateControl}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.dateField}>
      <input id={id} type="text" dir="ltr" required={required} value={value ?? ""} placeholder="YYYY-MM-DD" maxLength={10}
        pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" title="السنة ثم الشهر ثم اليوم" aria-describedby={`${id}-hint`}
        onChange={event => onChange(event.target.value || undefined)} />
      <CalendarDays size={18} aria-hidden="true" />
      <input className={styles.datePicker} type="date" aria-label={`اختيار ${label} من التقويم`} value={/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : ""}
        min={min} onChange={event => onChange(event.target.value || undefined)} onClick={event => { try { event.currentTarget.showPicker?.(); } catch { /* Native picker remains available */ } }} />
    </div>
    <small id={`${id}-hint`}>السنة ثم الشهر ثم اليوم<br />{hint}</small>
  </div>;
}

export function AdminPlatformCouponsPage({ coupons: initialCoupons, plans, configError, referenceTime = 0 }: Props) {
  const [coupons, setCoupons] = useState(initialCoupons);
  const [editing, setEditing] = useState<Draft>(emptyCoupon);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [now, setNow] = useState(referenceTime);
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const timer = setInterval(tick, 30000); return () => clearInterval(timer); }, []);
  const paidPlans = plans.filter(plan => plan.active && plan.priceMonthly > 0);
  const isEditing = coupons.some(coupon => coupon.id === editing.id);
  const filtered = useMemo(() => coupons.filter(coupon => (!query.trim() || `${coupon.code} ${coupon.title}`.toLowerCase().includes(query.trim().toLowerCase())) && (filter === "all" || couponStatus(coupon, now) === filter)), [coupons, query, filter, now]);
  const includedMonths = editing.eligibleDurationMonths ?? [1, 3, 6, 12];
  function update(next: Partial<Draft>) { setEditing(current => ({ ...current, ...next })); }
  function begin(coupon?: PlatformDiscountCoupon) {
    setEditing(coupon ? { ...coupon, validFrom: couponSaudiDate(coupon.validFrom), validUntil: couponSaudiDate(coupon.validUntil) } : emptyCoupon());
    setNotice(null);
    formRef.current?.scrollIntoView({ block: "start" });
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }
  async function mutate(action: () => Promise<ActionResult<PlatformDiscountCoupon[]>>, success: string, reset = false) {
    if (lock.current || configError) return;
    lock.current = true; setBusy(true); setNotice(null);
    try { const result = await action(); if (!result.ok) { setNotice({ text: result.message, error: true }); return; } setCoupons(result.data); if (reset) setEditing(emptyCoupon()); setNotice({ text: success }); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : "تعذر إكمال العملية حاول مجددًا", error: true }); }
    finally { lock.current = false; setBusy(false); requestAnimationFrame(() => noticeRef.current?.focus()); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!includedMonths.length) { setNotice({ text: "اختر مدة اشتراك واحدة على الأقل", error: true }); return; }
    void mutate(() => savePlatformDiscountCouponAction(editing), "تم حفظ الكوبون وأصبح جاهزًا حسب الصلاحية المحددة", true);
  }
  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); setNotice({ text: "تم نسخ كود الكوبون" }); }
    catch { setNotice({ text: "تعذر النسخ التلقائي يمكنك تحديد الكود ونسخه", error: true }); }
  }
  const rows = filtered.map(coupon => ({ code: coupon.code, title: coupon.title, discount: `${coupon.discountPercent}%`, durations: (coupon.eligibleDurationMonths ?? [1, 3, 6, 12]).map(formatSubscriptionDuration).join(" / "), usage: coupon.redeemedCount, status: couponStatusLabels[couponStatus(coupon, now)], expiry: couponSaudiDate(coupon.validUntil) || "غير محدد" }));
  const columns = [{ key: "code", title: "الكود" }, { key: "title", title: "الحملة" }, { key: "discount", title: "الخصم" }, { key: "durations", title: "مدد الاشتراك" }, { key: "usage", title: "الاستخدام" }, { key: "status", title: "الحالة" }, { key: "expiry", title: "الانتهاء" }];

  return <div className={styles.page} dir="rtl"><AdminPageShell title="كوبونات خصم المنصة" subtitle="عرض مناسب في الوقت المناسب حوّل اهتمام العملاء إلى اشتراكات">
    {configError ? <p className={styles.error} role="alert">{configError}</p> : <section className={styles.metrics} aria-label="ملخص الكوبونات">
      <div><Ticket aria-hidden="true" /><span>إجمالي الكوبونات</span><strong>{number.format(coupons.length)}</strong></div>
      <div><Check aria-hidden="true" /><span>متاحة للاستخدام</span><strong>{number.format(coupons.filter(coupon => couponStatus(coupon, now) === "active").length)}</strong></div>
      <div><Percent aria-hidden="true" /><span>اشتراكات استخدمت الكوبون</span><strong>{number.format(coupons.reduce((sum, coupon) => sum + coupon.redeemedCount, 0))}</strong></div>
    </section>}
    {notice ? <p ref={noticeRef} tabIndex={-1} className={notice.error ? styles.error : styles.success} role={notice.error ? "alert" : "status"}>{notice.text}</p> : null}
    <div className={styles.workspace}>
      <form ref={formRef} onSubmit={save} className={styles.editor}>
        <header className={styles.sectionHeader}><div><span className={styles.eyebrow}>إعداد الحملة</span><h2>{isEditing ? "تعديل الكوبون" : "إنشاء كوبون تسويقي"}</h2></div>{isEditing ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => begin()}><Plus size={17} />كوبون جديد</button> : <Ticket size={28} aria-hidden="true" />}</header>
        <fieldset disabled={busy || Boolean(configError)} className={styles.fields}>
          <label>اسم الحملة<input required maxLength={120} minLength={2} value={editing.title} onChange={event => update({ title: event.target.value })} placeholder="مثال حملة افتتاح علامتك" /></label>
          <label>كود الكوبون<input required dir="ltr" minLength={3} maxLength={40} pattern="[A-Za-z0-9-]+" value={editing.code} onChange={event => update({ code: event.target.value.toUpperCase() })} placeholder="BRANDA20" /><small>حروف إنجليزية وأرقام دون مسافات</small></label>
          <label>نسبة الخصم %<input required type="number" min="0.01" max="100" step="0.01" value={editing.discountPercent} onChange={event => update({ discountPercent: Number(event.target.value) })} /></label>
          <label>حد الاستخدام<input type="number" min="1" step="1" value={editing.maxRedemptions ?? ""} onChange={event => update({ maxRedemptions: event.target.value ? Number(event.target.value) : undefined })} placeholder="غير محدود" /><small>يحسب عند اعتماد الاشتراك</small></label>
          <CouponDateField id="coupon-valid-from" label="بداية الصلاحية" value={editing.validFrom} onChange={value => update({ validFrom: value })} hint="اتركها فارغة ليبدأ فور التفعيل" />
          <CouponDateField id="coupon-valid-until" label="نهاية الصلاحية" required min={editing.validFrom} value={editing.validUntil} onChange={value => update({ validUntil: value })} hint="يشمل نهاية اليوم بتوقيت السعودية" />
          <fieldset className={styles.selection}><legend>مدد الاشتراك المشمولة</legend><p>حدد مدة واحدة أو أكثر لهذا العرض</p><div>{DEFAULT_SUBSCRIPTION_DURATIONS.map(option => <label key={option.months} className={styles.chip}><input type="checkbox" checked={includedMonths.includes(option.months)} onChange={event => update({ eligibleDurationMonths: event.target.checked ? [...includedMonths, option.months] : includedMonths.filter(month => month !== option.months) })} />{option.label}</label>)}</div></fieldset>
          <fieldset className={styles.selection}><legend>الباقات المشمولة</legend><label className={styles.allPlans}><input type="checkbox" checked={!editing.eligiblePlanIds.length} onChange={event => update({ eligiblePlanIds: event.target.checked ? [] : paidPlans.map(plan => plan.id) })} />جميع الباقات المدفوعة الحالية والجديدة</label><div>{paidPlans.map(plan => <button type="button" key={plan.id} aria-pressed={editing.eligiblePlanIds.includes(plan.id)} onClick={() => update({ eligiblePlanIds: editing.eligiblePlanIds.includes(plan.id) ? editing.eligiblePlanIds.filter(id => id !== plan.id) : [...editing.eligiblePlanIds, plan.id] })}>{plan.name}</button>)}</div><p>{editing.eligiblePlanIds.length ? "الكوبون متاح للباقات المحددة فقط" : "لا يوجد تقييد على الباقة"}</p></fieldset>
          <label className={styles.activeToggle}><input type="checkbox" checked={editing.active} onChange={event => update({ active: event.target.checked })} />تفعيل الكوبون حسب فترة الصلاحية</label>
          <footer className={styles.formFooter}><span>متاح لأول اشتراك والترقية والاشتراك بعد الانتهاء</span><button className={styles.primary} type="submit">{busy ? "جارٍ الحفظ" : "حفظ الكوبون"}</button></footer>
        </fieldset>
      </form>
      <aside className={styles.preview} aria-label="معاينة الكوبون"><span className={styles.eyebrow}>معاينة العرض</span><div className={styles.ticket}><div className={styles.ticketTop}><Ticket size={24} aria-hidden="true" /><span>عرض من برندة</span></div><h3>{editing.title || "حملتك القادمة تبدأ هنا"}</h3><strong className={styles.discount}>{number.format(editing.discountPercent)}<small>%</small></strong><p>خصم على اشتراك علامتك</p><div className={styles.ticketCode} dir="ltr">{editing.code || "YOUR-CODE"}</div><div className={styles.ticketFooter}><span>{includedMonths.map(formatSubscriptionDuration).join(" / ") || "حدد مدة الاشتراك"}</span><span>{editing.validUntil ? `صالح حتى ${editing.validUntil}` : "حدد تاريخ نهاية العرض"}</span></div></div><p className={styles.previewNote}>عند شمول الاشتراك السنوي يطبق الكوبون على المبلغ بعد خصم السنة</p><div className={styles.previewGuide}><h3>جاهز لحملتك التسويقية</h3><p>احفظ الكوبون ثم انسخ الكود وشاركه في إعلانك ليستخدمه العميل عند اختيار باقته</p></div></aside>
    </div>
    <section className={styles.registry} aria-labelledby="coupon-registry"><header className={styles.sectionHeader}><div><span className={styles.eyebrow}>متابعة الحملات</span><h2 id="coupon-registry">سجل الكوبونات <small>{number.format(filtered.length)}</small></h2></div><div className={styles.exports}><button type="button" className={styles.secondary} disabled={!rows.length} onClick={() => exportRowsToExcel("platform-coupons", rows, columns)}><ArrowDownToLine size={16} />Excel</button><button type="button" className={styles.secondary} disabled={!rows.length} onClick={() => exportRowsToPdf("كوبونات المنصة", rows, columns)}>PDF</button></div></header>
      <div className={styles.filters}><label><Search size={18} aria-hidden="true" /><input aria-label="البحث بالكود أو اسم الحملة" placeholder="ابحث بالكود أو اسم الحملة" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="حالة الكوبون" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">جميع الحالات</option>{Object.entries(couponStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {configError ? <p className={styles.empty}>تعذر عرض السجل حدّث الصفحة للمحاولة مجددًا</p> : !filtered.length ? <div className={styles.empty}><Ticket size={32} aria-hidden="true" /><h3>{coupons.length ? "لا توجد نتائج مطابقة" : "أطلق أول عرض لعملائك"}</h3><p>{coupons.length ? "جرّب تغيير البحث أو الحالة" : "سيظهر الكوبون هنا بعد الحفظ مع صلاحيته وعدد استخداماته"}</p></div> : <div className={styles.couponList}>{filtered.map(coupon => <article className={styles.couponRow} key={coupon.id}><div className={styles.rowIdentity}><span className={styles.status} data-status={couponStatus(coupon, now)}>{couponStatusLabels[couponStatus(coupon, now)]}</span><h3>{coupon.title}</h3><button type="button" className={styles.copy} onClick={() => copy(coupon.code)} aria-label={`نسخ ${coupon.code}`}><b dir="ltr">{coupon.code}</b><Copy size={14} /></button></div><div className={styles.rowDetails}><div><span>الخصم</span><strong>{number.format(coupon.discountPercent)}%</strong></div><div><span>الاشتراكات المشمولة</span><strong>{(coupon.eligibleDurationMonths ?? [1, 3, 6, 12]).map(formatSubscriptionDuration).join(" / ")}</strong><small>{coupon.eligiblePlanIds.length ? coupon.eligiblePlanIds.map(id => plans.find(plan => plan.id === id)?.name ?? "باقة مؤرشفة").join(" / ") : "جميع الباقات"}</small></div><div><span>الاستخدام</span><strong>{number.format(coupon.redeemedCount)}{coupon.maxRedemptions ? ` / ${number.format(coupon.maxRedemptions)}` : ""}</strong></div><div><span>ينتهي في</span><strong dir="ltr">{couponSaudiDate(coupon.validUntil) || "غير محدد"}</strong></div></div><div className={styles.rowActions}><button className={styles.secondary} type="button" disabled={busy} onClick={() => begin(coupon)}>تعديل</button><button type="button" className={styles.delete} disabled={busy} aria-label={`حذف كوبون ${coupon.code}`} onClick={() => { if (confirm("حذف الكوبون؟ الكوبونات المرتبطة بطلبات محفوظة يمكن إيقافها من التعديل")) void mutate(() => deletePlatformDiscountCouponAction(coupon.id), "تم حذف الكوبون", editing.id === coupon.id); }}><Trash2 size={17} /></button></div></article>)}</div>}
    </section>
  </AdminPageShell></div>;
}
