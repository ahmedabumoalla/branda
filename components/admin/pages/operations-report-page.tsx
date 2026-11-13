"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, MousePointerClick, BadgeCheck, ChevronDown, ChevronLeft, ChevronRight, CreditCard, ListFilter, RotateCcw, Search, SlidersHorizontal, Info } from "lucide-react";
import { loadOperationsReportAction } from "@/app/actions/operations-report";
import { AdminPageShell } from "@/components/ui/design-system";
import { WalletMessageHistory } from "@/components/loyalty/wallet-message-history";
import { MarketingCampaignHistory } from "@/components/admin/marketing-campaign-history";
import { defaultReportFilters, filterReportBrands, reportMetricLabels, reportMetrics, reportPeriodSchema, saudiDate, totalReportMetrics, type OperationsReport, type ReportFilters, type ReportMetric, type ReportPeriod } from "@/lib/analytics/operations-report";
import { getPlatformFeatureDefinition } from "@/lib/platform/feature-registry";
import styles from "./operations-report-page.module.css";

const number = (value: number) => value.toLocaleString("ar-SA");
const featureName = (id: string) => id === "standalone_menu" ? "المنيو المستقل" : getPlatformFeatureDefinition(id)?.titleAr || id;
const featureTone = (id: string) => id === "loyalty" ? styles.purple : id === "standalone_menu" || id === "menu" ? styles.blue : id === "orders" ? styles.green : styles.gold;
const subscriptionName: Record<string, string> = { active: "نشط", trial: "تجريبي", trialing: "تجريبي", expired: "منتهي", cancelled: "ملغي", canceled: "ملغي", suspended: "موقوف", none: "بدون اشتراك" };
const statusName: Record<string, string> = { active: "نشطة", suspended: "موقوفة", inactive: "غير نشطة", draft: "مسودة", pending: "قيد الانتظار", archived: "مؤرشفة" };
const pageSize = 10;
const views: { id: string; label: string; metrics: ReportMetric[] }[] = [
  { id: "overview", label: "نظرة عامة", metrics: ["menuVisits", "loyaltyCards", "stampOperations"] },
  { id: "access", label: "الدخول والوصول", metrics: ["dashboardLogins", "cashierLogins", "menuVisitors", "menuVisits", "appInstallClicks"] },
  { id: "loyalty", label: "الولاء والمكافآت", metrics: ["loyaltyCards", "appleCards", "googleCards", "stampOperations", "rewardOperations"] },
  { id: "campaigns", label: "الحملات والرسائل", metrics: ["campaignLaunched", "campaignTargets", "campaignSent", "campaignPending", "campaignFailed"] },
  { id: "orders", label: "الطلبات والبيجر", metrics: ["pagerUses", "ordersAccepted", "ordersRejected", "ordersCompleted", "ordersNotCompleted"] },
];
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
  const [period, setPeriod] = useState<ReportPeriod>({ from: initialReport?.from || "", to: initialReport?.to || "" });
  const [filters, setFilters] = useState<ReportFilters>({ ...defaultReportFilters });
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(initialReport ? "" : "تعذر تحميل البيانات أعد المحاولة بعد التحقق من صلاحية دخولك");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewId, setViewId] = useState("overview");
  const [messageBrand, setMessageBrand] = useState<{ id: string; name: string } | null>(null);
  const [campaignBrand, setCampaignBrand] = useState<{ id: string; name: string } | null>(null);
  const request = useRef(0);
  const [presetId, setPresetId] = useState<string>(initialReport?.from || initialReport?.to ? "custom" : "all");
  const activeFilterCount = Number(!!filters.brandId) + Number(filters.subscription !== "all") + Number(!!filters.feature) + filters.conditions.length;
  const brands = filterReportBrands(report?.brands || [], filters);
  const totals = totalReportMetrics(brands);
  const selectedBrand = report?.brands.find(brand => brand.id === selectedId);
  const view = views.find(item => item.id === viewId) || views[0];
  const features = Array.from(new Set(report?.brands.flatMap(brand => brand.features) || [])).sort((a, b) => featureName(a).localeCompare(featureName(b), "ar"));
  const pages = Math.max(1, Math.ceil(brands.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const dirtyPeriod = period.from !== (report?.from || "") || period.to !== (report?.to || "");
  const updateFilters = (patch: Partial<ReportFilters>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(0); };
  async function load(next: ReportPeriod = period) {
    if (!reportPeriodSchema.safeParse(next).success) { setError("أدخل فترة صحيحة؛ تاريخ النهاية يجب ألا يسبق البداية"); return; }
    const sequence = ++request.current;
    setBusy(true); setError("");
    try {
      const result = await loadOperationsReportAction(next);
      if (sequence !== request.current) return;
      if (result.ok) { setReport(result.data); setPage(0); } else setError(result.message);
    } catch { if (sequence === request.current) setError("تعذر الاتصال حاول تحميل التقرير مرة أخرى"); }
    finally { if (sequence === request.current) setBusy(false); }
  }
  function preset(days: number | null) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const start = new Date(`${today}T12:00:00Z`);
    if (days) start.setUTCDate(start.getUTCDate() - days + 1);
    const next = days === null ? { from: "", to: "" } : { from: start.toISOString().slice(0, 10), to: today };
    setPresetId(days === null ? "all" : String(days));
    setPeriod(next); void load(next);
  }
  async function exportPdf() {
    if (!report || busy || dirtyPeriod || !brands.length) return;
    setExporting(true); setError("");
    try { const { downloadOperationsReportPdf } = await import("@/lib/export/operations-report-pdf"); await downloadOperationsReportPdf(report, brands, filters); }
    catch { setError("تعذر إنشاء ملف التقرير حاول التصدير مرة أخرى"); }
    finally { setExporting(false); }
  }
  return <div className={styles.page}><AdminPageShell title="عمليات العلامات" subtitle="ملخص واضح للنشاط اختر علامة للاطلاع على تفاصيلها"
    action={<button className={styles.primary} disabled={!report || busy || exporting || dirtyPeriod || !brands.length} onClick={() => void exportPdf()}><ArrowDownToLine size={19} aria-hidden="true" />{exporting ? "جارٍ تجهيز التقرير…" : "تصدير تقرير PDF"}<span className={styles.exportCount}>{number(brands.length)} علامة</span></button>}>
    <div className={styles.root}>
      {report && <div className={styles.summary} aria-live="polite">{[
        { label: "زيارات المنيو", value: totals.menuVisits, hint: "عدد الزيارات خلال الفترة المعروضة", icon: MousePointerClick, tone: styles.gold },
        { label: "بطاقات الولاء", value: totals.loyaltyCards, hint: number(totals.loyaltyCustomers) + " عميل خلال الفترة", icon: CreditCard, tone: styles.blue },
        { label: "عمليات الختم", value: totals.stampOperations, hint: "عمليات الختم الناجحة خلال الفترة", icon: BadgeCheck, tone: styles.green },
      ].map(({ label, value, hint, icon: Icon, tone }) => <div key={label}><div className={styles.statTop}><span>{label}</span><span className={`${styles.statIcon} ${tone}`}><Icon size={20} aria-hidden="true" /></span></div><strong>{number(value)}</strong><span className={styles.statHint}>{hint}</span></div>)}</div>}
      <section className={styles.panel} aria-label="فلاتر التقرير">
        <div className={styles.quickFilters}>
          <label className={styles.searchLabel}><span className={styles.srOnly}>بحث في العلامات والباقات</span><span className={styles.searchField}><Search size={18} aria-hidden="true" /><input type="search" placeholder="ابحث عن علامة تجارية أو باقة" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} /></span></label>
          <div className={styles.presets} role="group" aria-label="الفترة الزمنية">{[[1, "اليوم"], [7, "٧ أيام"], [30, "٣٠ يومًا"], [null, "كل الفترات"]].map(([days, label]) => <button type="button" key={String(label)} disabled={busy} aria-pressed={presetId === (days === null ? "all" : String(days))} onClick={() => preset(days as number | null)}>{label}</button>)}</div>
          <button className={styles.refreshButton} disabled={busy} onClick={() => void load()} aria-label="تحديث التقرير"><RotateCcw size={17} aria-hidden="true" />{busy ? "جار التحديث" : "تحديث"}</button>
        </div>
        <div className={styles.filterOptions}>
          <details className={styles.customPeriod}><summary><ChevronDown size={15} aria-hidden="true" />فترة مخصصة</summary>
            <form className={styles.period} onSubmit={event => { event.preventDefault(); void load(); }}>
              <label>من تاريخ<input type="date" value={period.from} onChange={event => { setPresetId("custom"); setPeriod({ ...period, from: event.target.value }); }} /></label>
              <label>إلى تاريخ<input type="date" value={period.to} onChange={event => { setPresetId("custom"); setPeriod({ ...period, to: event.target.value }); }} /></label>
              <button className={styles.primary} disabled={busy} type="submit">تطبيق الفترة</button>
              <span className={styles.hint}>بتوقيت الرياض وتشمل يوم النهاية</span>
            </form>
          </details>
          <details className={styles.advancedFilters}><summary><SlidersHorizontal size={17} aria-hidden="true" />الفلاتر والترتيب {activeFilterCount > 0 && <span className={styles.resultCount}>{number(activeFilterCount)}</span>}<ChevronDown size={15} aria-hidden="true" /></summary>
            <div className={styles.filters}>
              <label>العلامة<select value={filters.brandId} onChange={event => updateFilters({ brandId: event.target.value })}><option value="">كل العلامات</option>{report?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
              <label>الاشتراك الحالي<select value={filters.subscription} onChange={event => updateFilters({ subscription: event.target.value as ReportFilters["subscription"] })}><option value="all">الكل</option><option value="subscribed">المشتركة حاليًا</option><option value="unsubscribed">بدون اشتراك ساري</option></select></label>
              <label>الميزة المفعّلة<select value={filters.feature} onChange={event => updateFilters({ feature: event.target.value })}><option value="">كل المميزات</option>{features.map(feature => <option key={feature} value={feature}>{featureName(feature)}</option>)}</select></label>
              <label>ترتيب حسب<select value={filters.sort} onChange={event => updateFilters({ sort: event.target.value as ReportFilters["sort"] })}><option value="name">اسم العلامة</option>{reportMetrics.map(metric => <option key={metric} value={metric}>{reportMetricLabels[metric]}</option>)}<option value="lastMenuVisit">آخر زيارة للمنيو</option></select></label>
              <label>اتجاه الترتيب<select value={filters.direction} onChange={event => updateFilters({ direction: event.target.value as "asc" | "desc" })}><option value="asc">تصاعدي</option><option value="desc">تنازلي</option></select></label>
            </div>
        <details className={styles.query}><summary><ListFilter size={17} aria-hidden="true" />استعلام رقمي متقدم {filters.conditions.length ? `· ${number(filters.conditions.length)} شروط` : ""}<ChevronDown size={16} aria-hidden="true" /></summary>
          <p>تظهر العلامات التي تحقق جميع الشروط مثال: زوار المنيو أكثر من ١٠٠ وبطاقات الولاء أقل من ٢٠</p>
          {filters.conditions.map((condition, index) => <div className={styles.condition} key={index}>
            <select aria-label={`مؤشر الشرط ${index + 1}`} value={condition.metric} onChange={event => updateFilters({ conditions: filters.conditions.map((item, i) => i === index ? { ...item, metric: event.target.value as ReportMetric } : item) })}>{reportMetrics.map(metric => <option value={metric} key={metric}>{reportMetricLabels[metric]}</option>)}</select>
            <select aria-label={`مقارنة الشرط ${index + 1}`} value={condition.operator} onChange={event => updateFilters({ conditions: filters.conditions.map((item, i) => i === index ? { ...item, operator: event.target.value as "gte" | "lte" | "eq" } : item) })}><option value="gte">أكبر من أو يساوي</option><option value="lte">أقل من أو يساوي</option><option value="eq">يساوي</option></select>
            <input aria-label={`قيمة الشرط ${index + 1}`} type="number" min="0" step="1" value={condition.value} onChange={event => updateFilters({ conditions: filters.conditions.map((item, i) => i === index ? { ...item, value: Math.max(0, Math.floor(Number(event.target.value))) } : item) })} />
            <button onClick={() => updateFilters({ conditions: filters.conditions.filter((_, i) => i !== index) })}>حذف الشرط</button>
          </div>)}
          <button disabled={filters.conditions.length >= 8} onClick={() => updateFilters({ conditions: [...filters.conditions, { metric: "menuVisitors", operator: "gte", value: 0 }] })}>إضافة شرط</button>
        </details>
          </details>
          {(activeFilterCount > 0 || filters.query) && <button className={styles.clearFilters} onClick={() => updateFilters({ ...defaultReportFilters })}><RotateCcw size={14} aria-hidden="true" />مسح الفلاتر</button>}
        </div>
      </section>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {dirtyPeriod && <p className={styles.notice}>الفترة المعدّلة لم تُطبّق بعد الأرقام المعروضة تخص آخر فترة محمّلة؛ طبّق الفترة قبل التصدير</p>}
      {report && <>
        <section className={`${styles.panel} ${styles.results}`} aria-label="بيانات العلامات" aria-busy={busy}>
          <div className={styles.heading}><div><h2>العلامات التجارية <span className={styles.resultCount}>{number(brands.length)} علامة</span></h2><p>{report.from || "بداية السجل"} — {report.to || "حتى الآن"}</p></div><span className={styles.updated}>آخر تحديث {saudiDate(report.generatedAt)}</span></div>
          <div className={styles.tableToolbar}><div className={styles.viewButtons} role="group" aria-label="نوع العمليات">{views.map(item => <button type="button" key={item.id} aria-pressed={viewId === item.id} onClick={() => setViewId(item.id)}>{item.label}</button>)}</div><p className={styles.hint}>اختر اسم العلامة لعرض التفاصيل</p></div>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="جدول عمليات العلامات قابل للتمرير"><table role="table">
            <caption className={styles.srOnly}>{view.label} خلال الفترة المحمّلة</caption>
            <thead>

              <tr className={styles.columnHeadings} role="row"><th scope="col">العلامة التجارية</th>{view.metrics.map(metric => <th scope="col" key={metric}>{reportMetricLabels[metric]}</th>)}</tr>
            </thead>
            <tbody>{brands.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(brand => <tr key={brand.id} role="row">
              <th scope="row"><button className={styles.brandButton} aria-label={`تفاصيل ${brand.name}`} aria-haspopup="dialog" onClick={() => setSelectedId(brand.id)}><span className={`${styles.avatar} ${brand.subscribed ? styles.green : styles.gold}`} aria-hidden="true">{brand.name.trim().slice(0, 1)}</span><span className={styles.brandName}>{brand.name}<span className={styles.planName}>{brand.planName || "بدون باقة"}</span></span><ChevronLeft size={16} className={styles.expandIcon} aria-hidden="true" /></button><span className={`${styles.status} ${brand.subscribed ? styles.green : styles.muted}`}>{brand.subscribed ? "اشتراك ساري" : "بدون اشتراك ساري"}</span></th>
              {view.metrics.map(metric => <td key={metric} data-label={reportMetricLabels[metric]} role="cell"><strong className={brand.metrics[metric] === 0 ? styles.zero : undefined}>{number(brand.metrics[metric])}</strong></td>)}
            </tr>)}</tbody>
            {brands.length > 0 && <tfoot><tr role="row"><th scope="row">إجمالي النتائج<small>{number(brands.length)} علامة</small></th>{view.metrics.map(metric => <td key={metric} data-label={reportMetricLabels[metric]} role="cell">{number(totals[metric])}</td>)}</tr></tfoot>}
          </table></div>
          {!brands.length && <p className={styles.empty}>لا توجد علامات تطابق هذه الفلاتر غيّر الشروط أو امسح فلاتر العلامات</p>}
          <nav className={styles.pagination} aria-label="صفحات العلامات"><span>{number(brands.length ? currentPage * pageSize + 1 : 0)}–{number(Math.min((currentPage + 1) * pageSize, brands.length))} من {number(brands.length)} علامة</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronRight size={17} aria-hidden="true" />السابق</button><span>صفحة <b>{number(currentPage + 1)}</b> من {number(pages)}</span><button disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>التالي<ChevronLeft size={17} aria-hidden="true" /></button></div></nav>
        </section>
        {selectedBrand && <dialog className={styles.historyDialog} ref={node => { if (node && !node.open) node.showModal(); }} onClose={() => setSelectedId(null)} aria-label={`تفاصيل ${selectedBrand.name}`}>
          <div className={styles.heading}><div><h2>{selectedBrand.name}</h2><p dir="ltr">{selectedBrand.slug}</p></div><button type="button" autoFocus onClick={event => event.currentTarget.closest("dialog")?.close()}>إغلاق التفاصيل</button></div>
          <div className={styles.detail}>
            <p>حالة العلامة: {statusName[selectedBrand.status] || selectedBrand.status} | الاشتراك: {subscriptionName[selectedBrand.subscriptionStatus] || selectedBrand.subscriptionStatus}</p>
            <p>الباقة: {selectedBrand.planName || "بدون باقة"} | انتهاء الاشتراك: {selectedBrand.expiresAt ? saudiDate(selectedBrand.expiresAt) : "غير محدد"}</p>
            <div className={styles.chips}>{selectedBrand.features.map(feature => <span key={feature} className={`${styles.chip} ${featureTone(feature)}`}>{featureName(feature)}</span>)}</div>
            <p>{report.from || "بداية السجل"} — {report.to || "حتى الآن"}</p>
            <div className={styles.detailActions}><button type="button" aria-label={`سجل رسائل ${selectedBrand.name}`} aria-haspopup="dialog" onClick={() => { setSelectedId(null); setMessageBrand({ id: selectedBrand.id, name: selectedBrand.name }); }}>سجل رسائل الولاء</button><button type="button" aria-label={`سجل حملات ${selectedBrand.name}`} aria-haspopup="dialog" onClick={() => { setSelectedId(null); setCampaignBrand({ id: selectedBrand.id, name: selectedBrand.name }); }}>سجل الحملات التسويقية</button></div>
            {views.filter(item => item.id !== "overview").map(group => <details className={styles.metricGroup} key={group.id} open={group.id === (viewId === "overview" ? "access" : viewId)}><summary>{group.label}<ChevronDown size={16} aria-hidden="true" /></summary><dl>{group.metrics.map(metric => <div key={metric}><dt>{reportMetricLabels[metric]}</dt><dd>{number(selectedBrand.metrics[metric])}</dd></div>)}</dl></details>)}
            <details className={styles.metricGroup}><summary>تفاصيل إضافية للرسائل والعملاء<ChevronDown size={16} aria-hidden="true" /></summary><dl>{reportMetrics.filter(metric => !views.some(item => item.metrics.includes(metric))).map(metric => <div key={metric}><dt>{reportMetricLabels[metric]}</dt><dd>{number(selectedBrand.metrics[metric])}</dd></div>)}</dl></details>
            <p>آخر زيارة للمنيو ضمن الفترة: {saudiDate(selectedBrand.periodLastMenuVisit)}</p><p>آخر زيارة عبر كامل السجل</p><LastVisit value={selectedBrand.lastMenuVisit} />
          </div>
        </dialog>}
        {messageBrand && <dialog className={styles.historyDialog} ref={node => { if (node && !node.open) node.showModal(); }} onClose={() => setMessageBrand(null)} aria-label={`سجل رسائل ${messageBrand.name}`}><div className={styles.historyClose}><button type="button" onClick={event => event.currentTarget.closest("dialog")?.close()}>إغلاق السجل</button></div><WalletMessageHistory key={messageBrand.id} brandId={messageBrand.id} brandName={messageBrand.name} dark /></dialog>}
        {campaignBrand && <dialog className={styles.historyDialog} ref={node => { if (node && !node.open) node.showModal(); }} onClose={() => setCampaignBrand(null)} aria-label={`سجل حملات ${campaignBrand.name}`}><div className={styles.historyClose}><button type="button" autoFocus onClick={event => event.currentTarget.closest("dialog")?.close()}>إغلاق سجل الحملات</button></div><MarketingCampaignHistory key={JSON.stringify([campaignBrand.id, report.from, report.to])} brandId={campaignBrand.id} brandName={campaignBrand.name} from={report.from} to={report.to} /></dialog>}
        <details className={`${styles.panel} ${styles.explainer}`}><summary><Info size={19} aria-hidden="true" />تعريف المؤشرات وتغطية البيانات</summary><ul className={styles.notes}>
          <li>دخول لوحة العلامة يحسب مرات الدخول المسجلة مع دمج التكرار خلال دقيقة ولا يعني إدخال كلمة المرور في كل مرة دخول الكاشير يحسب تسجيل الدخول الناجح لنقطة التشغيل ويشمل المالك عند دخوله للتشغيل</li>
          <li>تأكيد الطلبات ورفضها وإكمالها وعدم إكمالها تحسب إجراءات تغيير الحالة المسجلة وليست عدد مبيعات أو طلبات فريدة</li>
          <li>زوار المنيو معرّفات متصفح مميزة؛ ليست أعداد أشخاص موثّقين إجمالي العلامات قد يحسب الشخص نفسه لدى أكثر من علامة</li>
          <li>البطاقات والعملاء حسب تاريخ الإنشاء أو الإصدار داخل الفترة عملاء الولاء هم أصحاب البطاقات الصادرة في الفترة</li>
          <li>آيفون: بطاقات طُلب تنزيلها أندرويد: بطاقات أُنشئ لها رابط حفظ قد تستخدم البطاقة النظامين؛ هذه الأرقام لا تؤكد تثبيتها على الجهاز</li>
          <li>قراءات الختم والمكافأة تشمل العمليات الناجحة المسجلة فقط الاشتراكات والمميزات تعرض الوضع الحالي وآخر زيارة في التفاصيل عبر كامل السجل</li>
          <li>تتبّع المنيو متاح منذ {saudiDate(report.menuTrackingSince)} وتتبّع المحافظ منذ {saudiDate(report.walletTrackingSince)}؛ الصفر يعني عدم وجود سجل مطابق ضمن البيانات المتاحة</li>
          <li>استخدامات البيجر هي عدد الطلبات المسجلة خلال الفترة بما فيها الملغاة إعادة النداء للطلب نفسه لا تزيد العدد</li>
          <li>عملاء الترويج يُحسبون مرة واحدة لكل علامة خلال الفترة ومرات الإرسال تحسب كل إعلان لكل عميل مرة واحدة عبر المحفظتين</li>
          <li>تتبّع مستلمي الترويج متاح منذ {saudiDate(report.promotionTrackingSince)} ويشمل الإرسال المقبول من مزوّد المحفظة دون المحاولات الفاشلة أو المعلقة لا يثبت وصول إشعار أو قراءته على الجهاز ولا يعيد بناء مستلمي الإعلانات القديمة</li>
          <li>مؤشرات الحملات وسجلها يشملان الحملات المنشأة داخل الفترة بتوقيت السعودية وحالات الرسائل تعرض الوضع الحالي حتى لو تغير بعد نهاية الفترة</li>
          <li>الحملات المنطلقة بدأ موعدها ولم تُلغ قبل بدء المحاولة الحملات المجدولة للمستقبل تظهر في السجل والانتظار ولا تُحسب ضمن المنطلقة</li>
          <li>عملاء الحملات دون تكرار لكل علامة داخل الفترة وعدد الإرسال يُحسب لكل حملة حتى لو تكرر العميل ويعني قبول مزوّد الخدمة دون تأكيد الوصول أو القراءة</li>
          <li>غير المؤكدة والملغاة والمستبعدة تظهر مستقلة في التفاصيل والسجل ولا تُضاف إلى تعذر الإرسال</li>
        </ul></details>
      </>}
    </div>
  </AdminPageShell></div>;
}
