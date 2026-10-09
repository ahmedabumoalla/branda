"use client";

import { Fragment, useRef, useState } from "react";
import { loadOperationsReportAction } from "@/app/actions/operations-report";
import { AdminPageShell } from "@/components/ui/design-system";
import { defaultReportFilters, filterReportBrands, reportMetricLabels, reportMetrics, reportPeriodSchema, saudiDate, totalReportMetrics, type OperationsReport, type ReportFilters, type ReportMetric, type ReportPeriod } from "@/lib/analytics/operations-report";
import { getPlatformFeatureDefinition } from "@/lib/platform/feature-registry";
import styles from "./operations-report-page.module.css";

const number = (value: number) => value.toLocaleString("ar-SA");
const featureName = (id: string) => id === "standalone_menu" ? "المنيو المستقل" : getPlatformFeatureDefinition(id)?.titleAr || id;
const featureTone = (id: string) => id === "loyalty" ? styles.purple : id === "standalone_menu" || id === "menu" ? styles.blue : id === "orders" ? styles.green : styles.gold;
const subscriptionName: Record<string, string> = { active: "نشط", trial: "تجريبي", trialing: "تجريبي", expired: "منتهي", cancelled: "ملغي", canceled: "ملغي", suspended: "موقوف", none: "بدون اشتراك" };
const statusName: Record<string, string> = { active: "نشطة", suspended: "موقوفة", inactive: "غير نشطة", draft: "مسودة", pending: "قيد الانتظار", archived: "مؤرشفة" };
const pageSize = 25;
export function OperationsReportPage({ initialReport }: { initialReport: OperationsReport | null }) {
  const [report, setReport] = useState(initialReport);
  const [period, setPeriod] = useState<ReportPeriod>({ from: "", to: "" });
  const [filters, setFilters] = useState<ReportFilters>({ ...defaultReportFilters });
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(initialReport ? "" : "تعذر تحميل البيانات. أعد المحاولة بعد التحقق من صلاحية دخولك.");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const request = useRef(0);
  const brands = filterReportBrands(report?.brands || [], filters);
  const totals = totalReportMetrics(brands);
  const features = Array.from(new Set(report?.brands.flatMap(brand => brand.features) || [])).sort((a, b) => featureName(a).localeCompare(featureName(b), "ar"));
  const pages = Math.max(1, Math.ceil(brands.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const dirtyPeriod = period.from !== (report?.from || "") || period.to !== (report?.to || "");
  const updateFilters = (patch: Partial<ReportFilters>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(0); };
  async function load(next: ReportPeriod = period) {
    if (!reportPeriodSchema.safeParse(next).success) { setError("أدخل فترة صحيحة؛ تاريخ النهاية يجب ألا يسبق البداية."); return; }
    const sequence = ++request.current;
    setBusy(true); setError("");
    try {
      const result = await loadOperationsReportAction(next);
      if (sequence !== request.current) return;
      if (result.ok) { setReport(result.data); setPage(0); } else setError(result.message);
    } catch { if (sequence === request.current) setError("تعذر الاتصال. حاول تحميل التقرير مرة أخرى."); }
    finally { if (sequence === request.current) setBusy(false); }
  }
  function preset(days: number | null) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const start = new Date(`${today}T12:00:00Z`);
    if (days) start.setUTCDate(start.getUTCDate() - days + 1);
    const next = days === null ? { from: "", to: "" } : { from: start.toISOString().slice(0, 10), to: today };
    setPeriod(next); void load(next);
  }
  async function exportPdf() {
    if (!report || busy || dirtyPeriod || !brands.length) return;
    setExporting(true); setError("");
    try { const { downloadOperationsReportPdf } = await import("@/lib/export/operations-report-pdf"); await downloadOperationsReportPdf(report, brands, filters); }
    catch { setError("تعذر إنشاء ملف التقرير. حاول التصدير مرة أخرى."); }
    finally { setExporting(false); }
  }
  return <AdminPageShell title="عمليات العلامات" subtitle="الزيارات، الحسابات، الولاء والاشتراكات في تقرير واحد. اختر الفترة ثم قارن العلامات أو صدّر نتائج استعلامك."
    action={<button className={styles.primary} disabled={!report || busy || exporting || dirtyPeriod || !brands.length} onClick={() => void exportPdf()}>{exporting ? "جارٍ تجهيز التقرير…" : `تصدير تقرير PDF · ${number(brands.length)} علامة`}</button>}>
    <div className={styles.root}>
      <section className={styles.panel} aria-label="فلاتر التقرير">
        <div className={styles.heading}><h2>نطاق التقرير</h2><span>التوقيت المحلي للسعودية · يشمل يوم النهاية</span></div>
        <form className={styles.period} onSubmit={event => { event.preventDefault(); void load(); }}>
          <label>من تاريخ<input type="date" value={period.from} onChange={event => setPeriod({ ...period, from: event.target.value })} /></label>
          <label>إلى تاريخ<input type="date" value={period.to} onChange={event => setPeriod({ ...period, to: event.target.value })} /></label>
          <button className={styles.primary} disabled={busy} type="submit">{busy ? "جارٍ التحميل…" : "تطبيق الفترة / تحديث"}</button>
          <div className={styles.presets}>{[[1, "اليوم"], [7, "٧ أيام"], [30, "٣٠ يومًا"], [null, "كل الفترات"]].map(([days, label]) => <button type="button" key={String(label)} disabled={busy} onClick={() => preset(days as number | null)}>{label}</button>)}</div>
        </form>
        <div className={styles.filters}>
          <label>بحث في العلامات والباقات<input type="search" placeholder="اسم العلامة أو الرابط أو الباقة" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} /></label>
          <label>العلامة<select value={filters.brandId} onChange={event => updateFilters({ brandId: event.target.value })}><option value="">كل العلامات</option>{report?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label>الاشتراك الحالي<select value={filters.subscription} onChange={event => updateFilters({ subscription: event.target.value as ReportFilters["subscription"] })}><option value="all">الكل</option><option value="subscribed">المشتركة حاليًا</option><option value="unsubscribed">بدون اشتراك ساري</option></select></label>
          <label>الميزة المفعّلة<select value={filters.feature} onChange={event => updateFilters({ feature: event.target.value })}><option value="">كل المميزات</option>{features.map(feature => <option key={feature} value={feature}>{featureName(feature)}</option>)}</select></label>
        </div>
        <details className={styles.query}><summary>استعلام رقمي متقدم {filters.conditions.length ? `· ${number(filters.conditions.length)} شروط` : ""}</summary>
          <p>تظهر العلامات التي تحقق جميع الشروط. مثال: زوار الفرع أكثر من ١٠٠ وبطاقات الولاء أقل من ٢٠.</p>
          {filters.conditions.map((condition, index) => <div className={styles.condition} key={index}>
            <select aria-label={`مؤشر الشرط ${index + 1}`} value={condition.metric} onChange={event => updateFilters({ conditions: filters.conditions.map((item, i) => i === index ? { ...item, metric: event.target.value as ReportMetric } : item) })}>{reportMetrics.map(metric => <option value={metric} key={metric}>{reportMetricLabels[metric]}</option>)}</select>
            <select aria-label={`مقارنة الشرط ${index + 1}`} value={condition.operator} onChange={event => updateFilters({ conditions: filters.conditions.map((item, i) => i === index ? { ...item, operator: event.target.value as "gte" | "lte" | "eq" } : item) })}><option value="gte">أكبر من أو يساوي</option><option value="lte">أقل من أو يساوي</option><option value="eq">يساوي</option></select>
            <input aria-label={`قيمة الشرط ${index + 1}`} type="number" min="0" step="1" value={condition.value} onChange={event => updateFilters({ conditions: filters.conditions.map((item, i) => i === index ? { ...item, value: Math.max(0, Math.floor(Number(event.target.value))) } : item) })} />
            <button onClick={() => updateFilters({ conditions: filters.conditions.filter((_, i) => i !== index) })}>حذف الشرط</button>
          </div>)}
          <button disabled={filters.conditions.length >= 8} onClick={() => updateFilters({ conditions: [...filters.conditions, { metric: "storefrontVisitors", operator: "gte", value: 0 }] })}>إضافة شرط</button>
        </details>
      </section>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {dirtyPeriod && <p className={styles.notice}>الفترة المعدّلة لم تُطبّق بعد. الأرقام المعروضة تخص آخر فترة محمّلة؛ طبّق الفترة قبل التصدير.</p>}
      {report && <>
        <div className={styles.summary} aria-live="polite">{[["العلامات المطابقة", brands.length], ["علامات باشتراك ساري", brands.filter(brand => brand.subscribed).length], ["زوار الفرع عبر العلامات", totals.storefrontVisitors], ["بطاقات الولاء الصادرة", totals.loyaltyCards]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{number(value as number)}</strong></div>)}</div>
        <section className={styles.panel} aria-label="بيانات العلامات" aria-busy={busy}>
          <div className={styles.heading}><div><h2>{number(brands.length)} من {number(report.brands.length)} علامة</h2><p>الفترة المحمّلة: {report.from || "بداية السجل"} — {report.to || "حتى الآن"} · آخر تحديث: {saudiDate(report.generatedAt)}</p></div>
            <button onClick={() => updateFilters({ ...defaultReportFilters })}>مسح فلاتر العلامات</button></div>
          <div className={styles.sort}><label>ترتيب حسب<select value={filters.sort} onChange={event => updateFilters({ sort: event.target.value as ReportFilters["sort"] })}><option value="name">اسم العلامة</option>{reportMetrics.map(metric => <option key={metric} value={metric}>{reportMetricLabels[metric]}</option>)}<option value="lastStorefrontVisit">آخر زيارة للفرع</option><option value="lastMenuVisit">آخر زيارة للمنيو</option></select></label><label>الاتجاه<select value={filters.direction} onChange={event => updateFilters({ direction: event.target.value as "asc" | "desc" })}><option value="asc">تصاعدي</option><option value="desc">تنازلي</option></select></label></div>
          <p className={styles.hint}>مرّر الجدول أفقيًا لعرض جميع المؤشرات. افتح تفاصيل العلامة لعرض المميزات والأرقام كاملة.</p>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="جدول مقارنة العلامات، قابل للتمرير أفقيًا"><table>
            <caption className={styles.srOnly}>مؤشرات العلامات خلال الفترة المحمّلة، وآخر الزيارات عبر كامل السجل</caption>
            <thead><tr><th scope="col">العلامة / الاشتراك</th><th scope="col">زوار الفرع<small>والزيارات</small></th><th scope="col">حسابات الفرع<small>وإجمالي الحسابات الجديدة</small></th><th scope="col">زوار المنيو<small>والزيارات</small></th><th scope="col">بطاقات الولاء<small>والعملاء</small></th><th scope="col">آيفون<small>وأندرويد</small></th><th scope="col">قراءات ناجحة<small>ختم / مكافأة</small></th><th scope="col">آخر زيارة للفرع</th><th scope="col">آخر زيارة للمنيو</th></tr></thead>
            <tbody>{brands.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(brand => <Fragment key={brand.id}><tr>
              <th scope="row"><button className={styles.brandButton} aria-expanded={expanded === brand.id} aria-controls={`brand-${brand.id}`} onClick={() => setExpanded(expanded === brand.id ? null : brand.id)}>{brand.name}<span>{expanded === brand.id ? "إغلاق التفاصيل −" : "عرض التفاصيل +"}</span></button><span className={`${styles.chip} ${brand.subscribed ? styles.green : styles.muted}`}>{brand.subscribed ? "اشتراك ساري" : "بدون اشتراك ساري"}</span><small>{brand.planName || "بدون باقة"} · {number(brand.features.length)} ميزة</small><div className={styles.chips}>{brand.features.filter(feature => ["loyalty", "standalone_menu", "orders", "menu"].includes(feature)).map(feature => <span key={feature} className={`${styles.chip} ${featureTone(feature)}`}>{featureName(feature)}</span>)}</div></th>
              <td><strong>{number(brand.metrics.storefrontVisitors)}</strong><small>{number(brand.metrics.storefrontVisits)} زيارة</small></td>
              <td><strong>{number(brand.metrics.storefrontAccounts)}</strong><small>{number(brand.metrics.accounts)} إجمالي جديد</small><small>{number(brand.metrics.unattributedAccounts)} مصدر غير محدد</small></td>
              <td><strong>{number(brand.metrics.menuVisitors)}</strong><small>{number(brand.metrics.menuVisits)} زيارة</small></td>
              <td><strong>{number(brand.metrics.loyaltyCards)}</strong><small>{number(brand.metrics.loyaltyCustomers)} عميل</small></td>
              <td><strong>{number(brand.metrics.appleCards)} آيفون</strong><small>{number(brand.metrics.googleCards)} أندرويد</small></td>
              <td><strong>{number(brand.metrics.stampOperations)} ختم</strong><small>{number(brand.metrics.rewardOperations)} مكافأة</small></td>
              <td className={styles.date}>{saudiDate(brand.lastStorefrontVisit)}</td><td className={styles.date}>{saudiDate(brand.lastMenuVisit)}</td>
            </tr><tr id={`brand-${brand.id}`} hidden={expanded !== brand.id}><td colSpan={9}><div className={styles.detail}>
              <p>حالة العلامة: {statusName[brand.status] || brand.status} · حالة الاشتراك المسجلة: {subscriptionName[brand.subscriptionStatus] || brand.subscriptionStatus} · انتهاء الاشتراك: {brand.expiresAt ? saudiDate(brand.expiresAt) : "غير محدد"}</p>
              <h3>المميزات المفعّلة حاليًا · {number(brand.features.length)}</h3><div className={styles.chips}>{brand.features.map(feature => <span key={feature} className={`${styles.chip} ${featureTone(feature)}`}>{featureName(feature)}</span>)}</div>
              <dl>{reportMetrics.map(metric => <div key={metric}><dt>{reportMetricLabels[metric]}</dt><dd>{number(brand.metrics[metric])}</dd></div>)}</dl>
              <p>آخر زيارة ضمن الفترة — الفرع: {saudiDate(brand.periodLastStorefrontVisit)} · المنيو: {saudiDate(brand.periodLastMenuVisit)}</p>
            </div></td></tr></Fragment>)}</tbody>
            {brands.length > 0 && <tfoot><tr><th scope="row">إجمالي النتائج</th><td>{number(totals.storefrontVisitors)}<small>{number(totals.storefrontVisits)} زيارة</small></td><td>{number(totals.storefrontAccounts)}<small>{number(totals.accounts)} إجمالي جديد</small></td><td>{number(totals.menuVisitors)}<small>{number(totals.menuVisits)} زيارة</small></td><td>{number(totals.loyaltyCards)}<small>{number(totals.loyaltyCustomers)} عميل</small></td><td>{number(totals.appleCards)} آيفون<small>{number(totals.googleCards)} أندرويد</small></td><td>{number(totals.stampOperations)} ختم<small>{number(totals.rewardOperations)} مكافأة</small></td><td colSpan={2}>جميع العلامات المطابقة</td></tr></tfoot>}
          </table></div>
          {!brands.length && <p className={styles.empty}>لا توجد علامات تطابق هذه الفلاتر. غيّر الشروط أو امسح فلاتر العلامات.</p>}
          <nav className={styles.pagination} aria-label="صفحات العلامات"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>السابق</button><span>صفحة {number(currentPage + 1)} من {number(pages)} · التصدير يشمل كل النتائج</span><button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>التالي</button></nav>
        </section>
        <section className={styles.panel} aria-label="تعريف المؤشرات وتغطية البيانات"><h2>كيف تُقرأ هذه الأرقام؟</h2><ul className={styles.notes}>
          <li>زوار الفرع جلسات تصفح مميزة، وزوار المنيو معرّفات متصفح مميزة؛ ليست أعداد أشخاص موثّقين. إجمالي العلامات قد يحسب الشخص نفسه لدى أكثر من علامة.</li>
          <li>الحسابات والبطاقات والعملاء حسب تاريخ الإنشاء أو الإصدار داخل الفترة. عملاء الولاء هم أصحاب البطاقات الصادرة في الفترة.</li>
          <li>آيفون: بطاقات طُلب تنزيلها. أندرويد: بطاقات أُنشئ لها رابط حفظ. قد تستخدم البطاقة النظامين؛ هذه الأرقام لا تؤكد تثبيتها على الجهاز.</li>
          <li>قراءات الختم والمكافأة تشمل العمليات الناجحة المسجلة فقط. الاشتراكات والمميزات تعرض الوضع الحالي، وآخر زيارة في الجدول عبر كامل السجل.</li>
          <li>تتبّع المنيو متاح منذ {saudiDate(report.menuTrackingSince)}، وتتبّع المحافظ منذ {saudiDate(report.walletTrackingSince)}، ومصدر إنشاء الحساب منذ {saudiDate(report.registrationTrackingSince)}. المصادر القديمة غير المعروفة تبقى غير محددة؛ الصفر يعني عدم وجود سجل مطابق ضمن البيانات المتاحة.</li>
        </ul></section>
      </>}
    </div>
  </AdminPageShell>;
}
