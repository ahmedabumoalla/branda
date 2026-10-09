"use client";

import { Fragment, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpDown, BadgeCheck, Building2, ChevronDown, ChevronLeft, ChevronRight, CreditCard, ListFilter, RotateCcw, Search, SlidersHorizontal, Users, Info } from "lucide-react";
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
function LastVisit({ value }: { value: string | null }) {
  if (!value) return <span className={styles.noVisit}><span aria-hidden="true">—</span><small>لا توجد زيارة مسجلة</small></span>;
  const date = new Date(value);
  return <time dateTime={value} className={styles.visitTime}>
    {new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" }).format(date)}
    <small>{new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(date)}</small>
  </time>;
}
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
  return <div className={styles.page}><AdminPageShell title="عمليات العلامات" subtitle="صورة كاملة لأداء علاماتك. قارن الوصول والولاء، وحدّد البيانات التي تهمك."
    action={<button className={styles.primary} disabled={!report || busy || exporting || dirtyPeriod || !brands.length} onClick={() => void exportPdf()}><ArrowDownToLine size={19} aria-hidden="true" />{exporting ? "جارٍ تجهيز التقرير…" : "تصدير تقرير PDF"}<span className={styles.exportCount}>{number(brands.length)} علامة</span></button>}>
    <div className={styles.root}>
      {report && <div className={styles.summary} aria-live="polite">{[
        { label: "العلامات المطابقة", value: brands.length, hint: `من أصل ${number(report.brands.length)} علامة`, icon: Building2, tone: styles.gold },
        { label: "اشتراكات سارية", value: brands.filter(brand => brand.subscribed).length, hint: "حالة الاشتراكات الحالية", icon: BadgeCheck, tone: styles.green },
        { label: "زوار الفرع عبر العلامات", value: totals.storefrontVisitors, hint: `${number(totals.storefrontVisits)} زيارة خلال الفترة`, icon: Users, tone: styles.blue },
        { label: "بطاقات الولاء الصادرة", value: totals.loyaltyCards, hint: `${number(totals.loyaltyCustomers)} عميل خلال الفترة`, icon: CreditCard, tone: styles.purple },
      ].map(({ label, value, hint, icon: Icon, tone }) => <div key={label}><div className={styles.statTop}><span>{label}</span><span className={`${styles.statIcon} ${tone}`}><Icon size={20} aria-hidden="true" /></span></div><strong>{number(value)}</strong><span className={styles.statHint}>{hint}</span></div>)}</div>}
      <section className={styles.panel} aria-label="فلاتر التقرير">
        <div className={styles.heading}><h2><SlidersHorizontal size={19} aria-hidden="true" />خصّص تقريرك</h2><span>التوقيت المحلي للسعودية · يشمل يوم النهاية</span></div>
        <form className={styles.period} onSubmit={event => { event.preventDefault(); void load(); }}>
          <label>من تاريخ<input type="date" value={period.from} onChange={event => setPeriod({ ...period, from: event.target.value })} /></label>
          <label>إلى تاريخ<input type="date" value={period.to} onChange={event => setPeriod({ ...period, to: event.target.value })} /></label>
          <button className={styles.primary} disabled={busy} type="submit"><RotateCcw size={16} aria-hidden="true" />{busy ? "جارٍ التحميل…" : "تطبيق الفترة / تحديث"}</button>
          <div className={styles.presets}>{[[1, "اليوم"], [7, "٧ أيام"], [30, "٣٠ يومًا"], [null, "كل الفترات"]].map(([days, label]) => <button type="button" key={String(label)} disabled={busy} onClick={() => preset(days as number | null)}>{label}</button>)}</div>
        </form>
        <div className={styles.filters}>
          <label>بحث في العلامات والباقات<span className={styles.searchField}><Search size={18} aria-hidden="true" /><input type="search" placeholder="اسم العلامة أو الرابط أو الباقة" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} /></span></label>
          <label>العلامة<select value={filters.brandId} onChange={event => updateFilters({ brandId: event.target.value })}><option value="">كل العلامات</option>{report?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label>الاشتراك الحالي<select value={filters.subscription} onChange={event => updateFilters({ subscription: event.target.value as ReportFilters["subscription"] })}><option value="all">الكل</option><option value="subscribed">المشتركة حاليًا</option><option value="unsubscribed">بدون اشتراك ساري</option></select></label>
          <label>الميزة المفعّلة<select value={filters.feature} onChange={event => updateFilters({ feature: event.target.value })}><option value="">كل المميزات</option>{features.map(feature => <option key={feature} value={feature}>{featureName(feature)}</option>)}</select></label>
        </div>
        <details className={styles.query}><summary><ListFilter size={17} aria-hidden="true" />استعلام رقمي متقدم {filters.conditions.length ? `· ${number(filters.conditions.length)} شروط` : ""}<ChevronDown size={16} aria-hidden="true" /></summary>
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
        <section className={`${styles.panel} ${styles.results}`} aria-label="بيانات العلامات" aria-busy={busy}>
          <div className={styles.heading}><div><h2>مقارنة العلامات <span className={styles.resultCount}>{number(brands.length)} / {number(report.brands.length)}</span></h2><p>{report.from || "بداية السجل"} — {report.to || "حتى الآن"}<span className={styles.updated}>آخر تحديث: {saudiDate(report.generatedAt)}</span></p></div>
            <button className={styles.reset} onClick={() => updateFilters({ ...defaultReportFilters })}><RotateCcw size={15} aria-hidden="true" />مسح فلاتر العلامات</button></div>
          <div className={styles.tableToolbar}><div className={styles.sort}><ArrowUpDown size={17} aria-hidden="true" /><label><span className={styles.srOnly}>ترتيب حسب</span><select value={filters.sort} onChange={event => updateFilters({ sort: event.target.value as ReportFilters["sort"] })}><option value="name">اسم العلامة</option>{reportMetrics.map(metric => <option key={metric} value={metric}>{reportMetricLabels[metric]}</option>)}<option value="lastStorefrontVisit">آخر زيارة للفرع</option><option value="lastMenuVisit">آخر زيارة للمنيو</option></select></label><label><span className={styles.srOnly}>الاتجاه</span><select value={filters.direction} onChange={event => updateFilters({ direction: event.target.value as "asc" | "desc" })}><option value="asc">تصاعدي</option><option value="desc">تنازلي</option></select></label></div>
          <p className={styles.hint}><ArrowLeftRight size={16} aria-hidden="true" />مرّر للمقارنة · اضغط على العلامة لعرض التفاصيل</p></div>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="جدول مقارنة العلامات، قابل للتمرير أفقيًا"><table>
            <caption className={styles.srOnly}>مؤشرات العلامات خلال الفترة المحمّلة، وآخر الزيارات عبر كامل السجل</caption>
            <thead><tr className={styles.columnGroups}><th scope="col" rowSpan={2}>العلامة التجارية<small>الاشتراك والمميزات</small></th><th scope="colgroup" colSpan={3}>الوصول الرقمي</th><th scope="colgroup" colSpan={3}>الولاء والتفاعل</th><th scope="colgroup" colSpan={2}>آخر نشاط مسجّل</th></tr><tr><th scope="col">زوار الفرع<small>والزيارات</small></th><th scope="col">حسابات الفرع<small>وإجمالي الحسابات الجديدة</small></th><th scope="col">زوار المنيو<small>والزيارات</small></th><th scope="col">بطاقات الولاء<small>والعملاء</small></th><th scope="col">المحافظ<small>آيفون / أندرويد</small></th><th scope="col">قراءات ناجحة<small>ختم / مكافأة</small></th><th scope="col">آخر زيارة للفرع</th><th scope="col">آخر زيارة للمنيو</th></tr></thead>
            <tbody>{brands.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(brand => <Fragment key={brand.id}><tr className={expanded === brand.id ? styles.selectedRow : undefined}>
              <th scope="row"><button className={styles.brandButton} aria-expanded={expanded === brand.id} aria-controls={`brand-${brand.id}`} onClick={() => setExpanded(expanded === brand.id ? null : brand.id)}><span className={`${styles.avatar} ${brand.subscribed ? styles.green : styles.gold}`} aria-hidden="true">{brand.name.trim().slice(0, 1)}</span><span className={styles.brandName}>{brand.name}<span className={styles.brandSlug} dir="ltr">{brand.slug}</span></span><ChevronDown size={16} className={styles.expandIcon} aria-hidden="true" /><span className={styles.srOnly}>{expanded === brand.id ? "إغلاق التفاصيل" : "عرض التفاصيل"}</span></button><div className={styles.brandMeta}><span className={`${styles.status} ${brand.subscribed ? styles.green : styles.muted}`}>{brand.subscribed ? "اشتراك ساري" : "بدون اشتراك ساري"}</span><span className={styles.planName}>{brand.planName || "بدون باقة"}</span></div><div className={styles.chips}>{brand.features.filter(feature => ["loyalty", "standalone_menu", "orders", "menu"].includes(feature)).map(feature => <span key={feature} className={`${styles.chip} ${featureTone(feature)}`}>{featureName(feature)}</span>)}</div></th>
              <td><strong>{number(brand.metrics.storefrontVisitors)}</strong><small>{number(brand.metrics.storefrontVisits)} زيارة</small></td>
              <td><strong>{number(brand.metrics.storefrontAccounts)}</strong><small>{number(brand.metrics.accounts)} إجمالي جديد</small><small>{number(brand.metrics.unattributedAccounts)} مصدر غير محدد</small></td>
              <td><strong>{number(brand.metrics.menuVisitors)}</strong><small>{number(brand.metrics.menuVisits)} زيارة</small></td>
              <td><strong>{number(brand.metrics.loyaltyCards)}</strong><small>{number(brand.metrics.loyaltyCustomers)} عميل</small></td>
              <td><div className={styles.metricPair}><span><strong>{number(brand.metrics.appleCards)}</strong><small>آيفون</small></span><span><strong>{number(brand.metrics.googleCards)}</strong><small>أندرويد</small></span></div></td>
              <td><div className={styles.metricPair}><span><strong>{number(brand.metrics.stampOperations)}</strong><small>ختم</small></span><span><strong>{number(brand.metrics.rewardOperations)}</strong><small>مكافأة</small></span></div></td>
              <td className={styles.date}><LastVisit value={brand.lastStorefrontVisit} /></td><td className={styles.date}><LastVisit value={brand.lastMenuVisit} /></td>
            </tr><tr id={`brand-${brand.id}`} hidden={expanded !== brand.id}><td colSpan={9}><div className={styles.detail}>
              <p>حالة العلامة: {statusName[brand.status] || brand.status} · حالة الاشتراك المسجلة: {subscriptionName[brand.subscriptionStatus] || brand.subscriptionStatus} · انتهاء الاشتراك: {brand.expiresAt ? saudiDate(brand.expiresAt) : "غير محدد"}</p>
              <h3>المميزات المفعّلة حاليًا · {number(brand.features.length)}</h3><div className={styles.chips}>{brand.features.map(feature => <span key={feature} className={`${styles.chip} ${featureTone(feature)}`}>{featureName(feature)}</span>)}</div>
              <dl>{reportMetrics.map(metric => <div key={metric}><dt>{reportMetricLabels[metric]}</dt><dd>{number(brand.metrics[metric])}</dd></div>)}</dl>
              <p>آخر زيارة ضمن الفترة — الفرع: {saudiDate(brand.periodLastStorefrontVisit)} · المنيو: {saudiDate(brand.periodLastMenuVisit)}</p>
            </div></td></tr></Fragment>)}</tbody>
            {brands.length > 0 && <tfoot><tr><th scope="row">إجمالي النتائج</th><td>{number(totals.storefrontVisitors)}<small>{number(totals.storefrontVisits)} زيارة</small></td><td>{number(totals.storefrontAccounts)}<small>{number(totals.accounts)} إجمالي جديد</small></td><td>{number(totals.menuVisitors)}<small>{number(totals.menuVisits)} زيارة</small></td><td>{number(totals.loyaltyCards)}<small>{number(totals.loyaltyCustomers)} عميل</small></td><td>{number(totals.appleCards)} آيفون<small>{number(totals.googleCards)} أندرويد</small></td><td>{number(totals.stampOperations)} ختم<small>{number(totals.rewardOperations)} مكافأة</small></td><td colSpan={2}>جميع العلامات المطابقة</td></tr></tfoot>}
          </table></div>
          {!brands.length && <p className={styles.empty}>لا توجد علامات تطابق هذه الفلاتر. غيّر الشروط أو امسح فلاتر العلامات.</p>}
          <nav className={styles.pagination} aria-label="صفحات العلامات"><span>التصدير يشمل جميع النتائج المطابقة</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronRight size={17} aria-hidden="true" />السابق</button><span>صفحة <b>{number(currentPage + 1)}</b> من {number(pages)}</span><button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>التالي<ChevronLeft size={17} aria-hidden="true" /></button></div></nav>
        </section>
        <section className={`${styles.panel} ${styles.explainer}`} aria-label="تعريف المؤشرات وتغطية البيانات"><h2><Info size={19} aria-hidden="true" />كيف تُقرأ هذه الأرقام؟</h2><ul className={styles.notes}>
          <li>زوار الفرع جلسات تصفح مميزة، وزوار المنيو معرّفات متصفح مميزة؛ ليست أعداد أشخاص موثّقين. إجمالي العلامات قد يحسب الشخص نفسه لدى أكثر من علامة.</li>
          <li>الحسابات والبطاقات والعملاء حسب تاريخ الإنشاء أو الإصدار داخل الفترة. عملاء الولاء هم أصحاب البطاقات الصادرة في الفترة.</li>
          <li>آيفون: بطاقات طُلب تنزيلها. أندرويد: بطاقات أُنشئ لها رابط حفظ. قد تستخدم البطاقة النظامين؛ هذه الأرقام لا تؤكد تثبيتها على الجهاز.</li>
          <li>قراءات الختم والمكافأة تشمل العمليات الناجحة المسجلة فقط. الاشتراكات والمميزات تعرض الوضع الحالي، وآخر زيارة في الجدول عبر كامل السجل.</li>
          <li>تتبّع المنيو متاح منذ {saudiDate(report.menuTrackingSince)}، وتتبّع المحافظ منذ {saudiDate(report.walletTrackingSince)}، ومصدر إنشاء الحساب منذ {saudiDate(report.registrationTrackingSince)}. المصادر القديمة غير المعروفة تبقى غير محددة؛ الصفر يعني عدم وجود سجل مطابق ضمن البيانات المتاحة.</li>
        </ul></section>
      </>}
    </div>
  </AdminPageShell></div>;
}
