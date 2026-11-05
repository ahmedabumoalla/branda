"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowDownToLine, Building2, ChevronLeft, ChevronRight, Clock3, CreditCard, Info, RotateCcw, Search, Users, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { AdminPageShell } from "@/components/ui/design-system";
import { BrandAnalyticsCampaign } from "@/components/admin/brand-analytics-campaign";
import { loadBrandCustomerAnalyticsAction, loadBrandAnalyticsDetailAction, loadBrandAnalyticsCustomerAction, loadBrandAnalyticsExportAction } from "@/app/actions/brand-customer-analytics";
import type { BrandAnalyticsReport, BrandAnalyticsDetail, BrandAnalyticsCustomerDetail, BrandAnalyticsFilters } from "@/lib/analytics/brand-customer-analytics";
import styles from "./brand-analytics-page.module.css";

type Brand = BrandAnalyticsReport["brands"][number];
type Customer = BrandAnalyticsDetail["customers"][number];
type Retention = Brand["retention"][number];
type Days = NonNullable<BrandAnalyticsFilters["days"]>;
const number = (value: number, maximumFractionDigits = 0) => value.toLocaleString("ar-SA", { maximumFractionDigits });
const normalize = (value: string) => value.toLocaleLowerCase("ar").normalize("NFKC").replace(/[\u064b-\u065f\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const shortDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh" });
const shortTime = new Intl.DateTimeFormat("ar-SA", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" });
const segments: { id: BrandAnalyticsFilters["segment"]; label: string }[] = [
  { id: "all", label: "كل العملاء" }, { id: "inactive", label: "منقطعون ١٠ أيام" },
  { id: "loyal", label: "منتظمون خلال ٤ أيام" }, { id: "returning", label: "عملاء عائدون" },
  { id: "new", label: "مسجلون حديثًا" }, { id: "no_card", label: "بدون بطاقة" },
];
const eventNames: Record<BrandAnalyticsCustomerDetail["events"][number]["kind"], string> = {
  stamp: "تسجيل ختم ناجح", redeem: "صرف مكافأة", coupon_redeemed: "صرف كوبون شخصي", card_issued: "إصدار بطاقة الولاء",
  download: "تجهيز ملف بطاقة Apple", save_link: "إنشاء رابط حفظ Google",
  installed: "تسجيل البطاقة على جهاز Apple", unregistered: "إلغاء تسجيل جهاز Apple",
};
function DateTime({ value, empty = "لا يوجد سجل" }: { value: string | null; empty?: string }) {
  if (!value) return <span className={styles.muted}>{empty}</span>;
  const date = new Date(value);
  return <time dateTime={value}>{shortDate.format(date)}<small>{shortTime.format(date)}</small></time>;
}
function DatePair({ label, value, empty }: { label: string; value: string | null; empty?: string }) {
  return <div className={styles.dateGroup}><span className={styles.dateLabel}>{label}</span><DateTime value={value} empty={empty} /></div>;
}
function Phone({ value }: { value: string }) {
  return value ? <a className={styles.phone} href={`tel:${value}`}>{value}</a> : <span className={styles.muted}>الجوال غير مسجل</span>;
}
function RetentionValue({ value }: { value: Retention | undefined }) {
  if (!value?.eligible || value.rate === null) return <span className={styles.muted}>لم تكتمل المدة<small>لا يوجد عملاء أكملوا الفترة</small></span>;
  return <div className={styles.retention}><strong>{number(value.rate, 1)}٪</strong><small>{number(value.retained)} عادوا من {number(value.eligible)} مؤهلين</small><div className={styles.retentionMeter} aria-hidden="true"><span style={{ width: `${Math.min(100, value.rate)}%` }} /></div></div>;
}
function Pagination({ page, total, pageSize = 25, busy, onPage, label }: { page: number; total: number; pageSize?: number; busy: boolean; onPage: (page: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className={styles.pagination} aria-label={label}><span>{total ? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, total))} من ${number(total)}` : "لا توجد نتائج"}</span><div><button disabled={busy || page <= 1} onClick={() => onPage(page - 1)}><ChevronRight size={16} aria-hidden="true" />السابق</button><span>صفحة <b>{number(page)}</b> من <b>{number(pages)}</b></span><button disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>التالي<ChevronLeft size={16} aria-hidden="true" /></button></div></nav>;
}
function Heatmap({ cells }: { cells: BrandAnalyticsDetail["heatmap"] }) {
  const [focused, setFocused] = useState(0);
  const [inspected, setInspected] = useState<{ day: number; hour: number; visits: number } | null>(null);
  const values = new Map(cells.map(cell => [`${cell.day}-${cell.hour}`, cell.visits]));
  const peak = [...cells].sort((a, b) => b.visits - a.visits || a.day - b.day || a.hour - b.hour)[0];
  const maximum = peak?.visits || 0;
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowLeft") next = Math.min(167, index + 1);
    else if (event.key === "ArrowRight") next = Math.max(0, index - 1);
    else if (event.key === "ArrowDown") next = Math.min(167, index + 24);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 24);
    else if (event.key === "Home") next = Math.floor(index / 24) * 24;
    else if (event.key === "End") next = Math.floor(index / 24) * 24 + 23;
    else return;
    event.preventDefault();
    setFocused(next);
    event.currentTarget.closest("table")?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }
  return <section className={styles.panel} aria-labelledby="brand-peak-title"><div className={styles.heading}><div><h2 id="brand-peak-title"><Clock3 size={20} aria-hidden="true" />متى يعود العملاء</h2><p>وقت أول ختم أو صرف مكافأة أو كوبون للعميل في اليوم بتوقيت الرياض</p></div><span className={styles.legend}>أقل<i /><i /><i /><i /><i />أكثر</span></div>
    {maximum ? <div className={styles.peakSummary}><p>أعلى نشاط مسجل<strong>{dayNames[peak.day]} من {number(peak.hour)} إلى {number(peak.hour + 1)}</strong></p><p><strong>{number(peak.visits)} زيارة</strong>خلال الفترة المختارة</p></div> : <p className={styles.hint}>لا توجد زيارات مسجلة في الفترة المختارة بعد</p>}
    <div className={styles.heatScroll}><table className={styles.heatmap}><caption>عدد زيارات العملاء حسب اليوم والساعة بنظام ٢٤ ساعة يمكنك التنقل بالأسهم بين الخلايا</caption><thead><tr><th scope="col">اليوم / الساعة</th>{Array.from({ length: 24 }, (_, hour) => <th scope="col" key={hour}>{number(hour)}</th>)}</tr></thead><tbody>{dayNames.map((day, dayIndex) => <tr key={day}><th scope="row">{day}</th>{Array.from({ length: 24 }, (_, hour) => {
      const visits = values.get(`${dayIndex}-${hour}`) || 0;
      const index = dayIndex * 24 + hour;
      const label = `${day} من الساعة ${number(hour)} إلى ${number(hour + 1)}: ${number(visits)} زيارة`;
      return <td key={hour}><button className={styles.heatCell} tabIndex={focused === index ? 0 : -1} data-level={visits ? Math.min(4, Math.ceil(visits / maximum * 4)) : 0} aria-label={label} title={label} onKeyDown={event => navigate(event, index)} onFocus={() => { setFocused(index); setInspected({ day: dayIndex, hour, visits }); }} onClick={() => setInspected({ day: dayIndex, hour, visits })} onMouseEnter={() => setInspected({ day: dayIndex, hour, visits })}>{number(visits)}</button></td>;
    })}</tr>)}</tbody></table></div>
    <p className={styles.heatInfo} role="status">{inspected ? `${dayNames[inspected.day]} من الساعة ${number(inspected.hour)} إلى ${number(inspected.hour + 1)}: ${number(inspected.visits)} زيارة` : "اختر خلية لعرض اليوم والوقت وعدد الزيارات"}</p><p className={styles.hint}>عمليات العميل المتعددة في اليوم نفسه تُحسب زيارة واحدة ويُنسب وقتها إلى أول عملية لذلك اليوم</p>
  </section>;
}
function RetentionPanel({ brand, cohorts }: { brand: Brand; cohorts: BrandAnalyticsDetail["cohorts"] }) {
  return <section className={`${styles.panel} ${styles.tablePanel}`} aria-labelledby="brand-retention-title"><div className={styles.heading}><div><h2 id="brand-retention-title">الاحتفاظ منذ إصدار البطاقة</h2><p>نسبة العملاء الذين عادوا في يوم مختلف بعد إصدار أول بطاقة خلال المدة المحددة</p></div></div><div className={styles.metrics}>{[7, 14, 30].map(days => <div key={days}><h3>خلال {number(days)} يومًا</h3><RetentionValue value={brand.retention.find(item => item.days === days)} /></div>)}</div>
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="جدول الاحتفاظ حسب شهر إصدار البطاقة"><table className={styles.cohortTable}><caption>مجموعات العملاء بحسب شهر إصدار أول بطاقة جميع الأشهر المتاحة</caption><thead><tr><th scope="col">شهر الإصدار</th><th scope="col">العملاء</th><th scope="col">خلال ٧ أيام</th><th scope="col">خلال ١٤ يومًا</th><th scope="col">خلال ٣٠ يومًا</th></tr></thead><tbody>{cohorts.map(cohort => <tr key={cohort.month}><th scope="row">{new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(new Date(`${cohort.month}-01T12:00:00Z`))}</th><td><strong>{number(cohort.issued)}</strong></td>{[7, 14, 30].map(days => <td key={days}><RetentionValue value={cohort.retention.find(item => item.days === days)} /></td>)}</tr>)}</tbody></table>{!cohorts.length && <p className={styles.empty}>لا توجد بطاقات صادرة لحساب الاحتفاظ بعد</p>}</div><div className={styles.panel}><p className={styles.hint}>المقام يشمل فقط من أكملوا ٧ أو ١٤ أو ٣٠ يومًا منذ الإصدار حتى وقت التقرير لا تُحسب البطاقات الجديدة كعملاء مفقودين ولا يُعتبر تحميل البطاقة عودة</p></div>
  </section>;
}
function CustomerFacts({ customer }: { customer: Customer }) {
  return <dl className={styles.customerFacts}>{[
    ["تاريخ التسجيل", <DateTime key="joined" value={customer.joinedAt} />],
    ["إصدار أول بطاقة", <DateTime key="issued" value={customer.cardIssuedAt} empty="لم تصدر بطاقة" />],
    ["أول عودة بعد الإصدار", <DateTime key="return" value={customer.firstReturnAt} empty="لا توجد عودة مسجلة" />],
    ["آخر ختم", <DateTime key="stamp" value={customer.lastStampAt} />],
    ["آخر صرف مكافأة", <DateTime key="redeem" value={customer.lastRedemptionAt} />],
    ["آخر زيارة", <DateTime key="visit" value={customer.lastVisitAt} />],
    ["أول ملف بطاقة Apple", <DateTime key="first-download" value={customer.wallet.firstDownloadAt} />],
    ["آخر ملف بطاقة Apple", <DateTime key="last-download" value={customer.wallet.lastDownloadAt} />],
    ["ملفات Apple المجهزة", number(customer.wallet.downloads)],
    ["أول رابط حفظ Google", <DateTime key="first-google" value={customer.wallet.firstGoogleSaveAt} />],
    ["آخر رابط حفظ Google", <DateTime key="last-google" value={customer.wallet.lastGoogleSaveAt} />],
    ["روابط Google المنشأة", number(customer.wallet.googleSaveLinks)],
    ["أول تسجيل على جهاز Apple", <DateTime key="first-install" value={customer.wallet.firstInstalledAt} />],
    ["آخر تسجيل على جهاز Apple", <DateTime key="last-install" value={customer.wallet.lastInstalledAt} />],
    ["أجهزة Apple المسجلة", number(customer.wallet.installedDevices)],
    ["أيام الزيارة", number(customer.visitDays)],
    ["متوسط الفترة بين الزيارات", customer.averageVisitGapDays === null ? "لا تكفي الزيارات لحسابه" : `${number(customer.averageVisitGapDays, 1)} يوم`],
    ["مدة الغياب", `${number(customer.inactiveDays)} يوم${customer.lastVisitAt ? " منذ آخر زيارة" : " دون زيارة مسجلة"}`],
    ["رصيد الأختام الحالي", number(customer.currentStamps)],
    ["إجمالي الأختام المكتسبة", number(customer.totalStamps)],
    ["المكافآت المصروفة", number(customer.rewardsRedeemed)],
    ["عدد البطاقات", number(customer.cardCount)],
    ["البريد الإلكتروني", customer.email || "غير مسجل"],
  ].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function BrandAnalyticsPage({ initialReport }: { initialReport: BrandAnalyticsReport | null }) {
  const [report, setReport] = useState(initialReport);
  const [days, setDays] = useState<Days>(initialReport?.days || 30);
  const [brandSearch, setBrandSearch] = useState("");
  const [brandPage, setBrandPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BrandAnalyticsDetail | null>(null);
  const [filters, setFilters] = useState<BrandAnalyticsFilters>({ brandId: "", days: initialReport?.days || 30, search: "", segment: "all", sort: "recent", page: 1 });
  const [searchDraft, setSearchDraft] = useState("");
  const [view, setView] = useState<"customers" | "peak" | "retention">("customers");
  const [busy, setBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState(initialReport ? "" : "تعذر تحميل التحليلات أعد المحاولة بعد التحقق من صلاحية دخولك");
  const [detailError, setDetailError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<BrandAnalyticsCustomerDetail | null>(null);
  const [customerBusy, setCustomerBusy] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const overviewRequest = useRef(0);
  const detailRequest = useRef(0);
  const customerRequest = useRef(0);
  const selectedCustomerTrigger = useRef<HTMLButtonElement | null>(null);
  const brands = (report?.brands || []).filter(brand => normalize(`${brand.name} ${brand.slug}`).includes(normalize(brandSearch.trim())));
  const brandPages = Math.max(1, Math.ceil(brands.length / 15));
  const currentBrandPage = Math.min(brandPage, brandPages);
  const selectedBrand = report?.brands.find(brand => brand.id === selectedId);
  const detailMatches = detail?.brand.id === selectedId && detail?.days === days;
  const customer = customerDetail && customerDetail.customer.id === selectedCustomer?.id ? customerDetail.customer : selectedCustomer;

  function closeCustomer() {
    ++customerRequest.current;
    setSelectedCustomer(null); setCustomerDetail(null); setCustomerError(""); setCustomerBusy(false);
    selectedCustomerTrigger.current?.focus();
  }
  async function loadDetail(next: BrandAnalyticsFilters) {
    const sequence = ++detailRequest.current;
    setFilters(next); setDetailBusy(true); setDetailError(""); setDetail(null);
    try {
      const result = await loadBrandAnalyticsDetailAction(next);
      if (sequence !== detailRequest.current) return;
      if (result.ok) setDetail(result.data); else setDetailError(result.message);
    } catch { if (sequence === detailRequest.current) setDetailError("تعذر تحميل تفاصيل العلامة حاول مرة أخرى"); }
    finally { if (sequence === detailRequest.current) setDetailBusy(false); }
  }
  async function refresh(nextDays: Days = days) {
    const sequence = ++overviewRequest.current;
    ++detailRequest.current; closeCustomer();
    setDays(nextDays); setBusy(true); setError(""); setDetail(null); setDetailBusy(false); setDetailError(""); setExportError("");
    try {
      const result = await loadBrandCustomerAnalyticsAction(nextDays);
      if (sequence !== overviewRequest.current) return;
      if (result.ok) {
        setReport(result.data);
        if (selectedId && result.data.brands.some(brand => brand.id === selectedId)) void loadDetail({ ...filters, days: nextDays, page: 1, asOf: undefined });
        else setSelectedId(null);
      } else { setError(result.message); setDays(report?.days || 30); }
    } catch { if (sequence === overviewRequest.current) { setError("تعذر الاتصال أعد تحميل التحليلات"); setDays(report?.days || 30); } }
    finally { if (sequence === overviewRequest.current) setBusy(false); }
  }
  function selectBrand(brand: Brand) {
    closeCustomer(); setSelectedId(brand.id); setSearchDraft(""); setView("customers"); setExportError("");
    void loadDetail({ brandId: brand.id, days, search: "", segment: "all", sort: "recent", page: 1 });
  }
  function filterCustomers(patch: Partial<BrandAnalyticsFilters>) {
    void loadDetail({ ...filters, ...patch, page: 1, asOf: undefined });
  }
  async function loadCustomer(next: Customer, page = 1) {
    if (!selectedId) return;
    const sequence = ++customerRequest.current;
    setSelectedCustomer(next); setCustomerBusy(true); setCustomerError(""); setCustomerDetail(null);
    try {
      const result = await loadBrandAnalyticsCustomerAction(selectedId, next.id, page);
      if (sequence !== customerRequest.current) return;
      if (result.ok) setCustomerDetail(result.data); else setCustomerError(result.message);
    } catch { if (sequence === customerRequest.current) setCustomerError("تعذر تحميل سجل العميل أعد المحاولة"); }
    finally { if (sequence === customerRequest.current) setCustomerBusy(false); }
  }
  async function exportBrand() {
    if (!selectedId || !detailMatches || busy || detailBusy || exporting) return;
    setExporting(true); setExportError("");
    try {
      const result = await loadBrandAnalyticsExportAction(selectedId, days);
      if (!result.ok) { setExportError(result.message); return; }
      const { downloadBrandAnalyticsPdf } = await import("@/lib/export/brand-analytics-pdf");
      await downloadBrandAnalyticsPdf(result.data);
    } catch { setExportError("تعذر تجهيز ملف العلامة حاول التصدير مرة أخرى"); }
    finally { setExporting(false); }
  }
  return <div className={styles.page} dir="rtl"><AdminPageShell title="تحليلات العلامات التجارية" subtitle="من إصدار البطاقة إلى الزيارة التالية تابع العملاء والعودة والاحتفاظ لكل علامة"
    action={<button className={styles.refresh} disabled={busy || exporting} onClick={() => void refresh()}><RotateCcw size={17} aria-hidden="true" />{busy ? "جارٍ التحديث" : "تحديث البيانات"}</button>}><div className={styles.root}>
    <section className={styles.panel} aria-label="نطاق التحليلات"><div className={styles.toolbar}><label>ابحث عن علامة<span className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" placeholder="اسم العلامة أو رابطها" value={brandSearch} onChange={event => { setBrandSearch(event.target.value); setBrandPage(1); }} /></span></label><div><span className={styles.dateLabel}>فترة الزيارات والذروة</span><div className={styles.presets}>{([7, 30, 90, 365] as const).map(value => <button key={value} aria-pressed={days === value} disabled={busy || exporting} onClick={() => void refresh(value)}>{value === 365 ? "آخر سنة" : `آخر ${number(value)} يومًا`}</button>)}</div></div></div><div className={styles.scope}><span>الفترة تحدد عدد الزيارات وأوقات الذروة بقية المؤشرات تراكمية <strong>النشاط والانقطاع يُقاسان بآخر ١٠ أيام</strong></span>{report && <span>آخر تحديث <DateTime value={report.generatedAt} /></span>}</div></section>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {report && <>
      <dl className={styles.summary}>{[
        { label: "إجمالي تسجيلات العلامات", value: report.summary.registeredCustomers, hint: `علاقات العملاء بـ ${number(report.summary.brands)} علامة`, icon: Users },
        { label: "نشطون خلال ١٠ أيام", value: report.summary.activeCustomers, hint: "ختم أو صرف مكافأة أو كوبون مسجل", icon: UserRoundCheck },
        { label: "منقطعون ١٠ أيام", value: report.summary.inactiveCustomers, hint: "دون ختم أو صرف مكافأة أو كوبون", icon: UserRoundX },
        { label: "منتظمون خلال ٤ أيام", value: report.summary.loyalCustomers, hint: "٣ أيام زيارة على الأقل وعودة حديثة", icon: RotateCcw },
      ].map(({ label, value, hint, icon: Icon }) => <div key={label}><dt>{label}<Icon size={18} aria-hidden="true" /></dt><dd>{number(value)}</dd><small>{hint}</small></div>)}</dl>
      <section className={`${styles.panel} ${styles.tablePanel}`} aria-labelledby="analytics-brands-title"><div className={styles.heading}><div><h2 id="analytics-brands-title"><Building2 size={19} aria-hidden="true" />كل العلامات</h2><p>اختر علامة لعرض العملاء وأرقامهم وسجل الولاء بالتفصيل</p></div><span className={styles.count}>{number(brands.length)} علامة مطابقة</span></div><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="مقارنة العلامات التجارية" aria-busy={busy}><table className={styles.brandTable}><thead><tr>{["العلامة", "العملاء", "أصحاب البطاقات", "طلبوا المحفظة", "نشطون خلال ١٠ أيام", "منقطعون ١٠ أيام", "انتظام خلال ٤ أيام", "احتفاظ ٣٠ يومًا"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{brands.slice((currentBrandPage - 1) * 15, currentBrandPage * 15).map(brand => <tr key={brand.id} data-selected={selectedId === brand.id}><th scope="row"><button className={styles.brandButton} aria-expanded={selectedId === brand.id} aria-controls="brand-analytics-detail" disabled={busy || exporting} onClick={() => selectBrand(brand)}><span><strong>{brand.name}</strong><small dir="ltr">{brand.slug}</small></span><ChevronLeft size={17} aria-hidden="true" /></button></th><td><strong>{number(brand.registeredCustomers)}</strong></td><td><strong>{number(brand.cardholders)}</strong></td><td><strong>{number(brand.walletCustomers)}</strong></td><td><strong>{number(brand.activeCustomers)}</strong></td><td><strong className={brand.inactiveCustomers ? styles.warning : undefined}>{number(brand.inactiveCustomers)}</strong></td><td><strong>{number(brand.loyalCustomers)}</strong></td><td><RetentionValue value={brand.retention.find(item => item.days === 30)} /></td></tr>)}</tbody></table>{!brands.length && <div className={styles.empty}><Building2 size={26} aria-hidden="true" /><p>لا توجد علامات تطابق البحث جرّب اسمًا آخر</p></div>}</div><Pagination page={currentBrandPage} total={brands.length} pageSize={15} busy={busy} onPage={setBrandPage} label="صفحات العلامات" /></section>
    </>}
    {selectedBrand ? <section id="brand-analytics-detail" className={styles.detail} aria-label={`تحليلات ${selectedBrand.name}`} aria-busy={detailBusy}>
      <div className={`${styles.panel} ${styles.detailHeader}`}><div className={styles.heading}><div><h2>{selectedBrand.name}</h2><p>سجل العملاء كاملًا والزيارات والذروة لآخر {number(days)} يومًا</p></div><button className={styles.primary} disabled={!detailMatches || busy || detailBusy || exporting} onClick={() => void exportBrand()}><ArrowDownToLine size={18} aria-hidden="true" />{exporting ? "جارٍ تجهيز جميع العملاء" : "تقرير العلامة الكامل PDF"}</button></div><p className={styles.hint}>التقرير بهوية برندا ويضم جميع عملاء العلامة حتى غير الظاهرين في البحث أو الصفحة الحالية</p><div className={styles.tabs} aria-label="أقسام تحليلات العلامة">{([{ id: "customers", label: "تفاصيل العملاء" }, { id: "peak", label: "أوقات الذروة" }, { id: "retention", label: "الاحتفاظ بالعملاء" }] as const).map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}</div></div>
      <BrandAnalyticsCampaign key={`${selectedBrand.id}:${filters.segment}`} brand={selectedBrand} initialSegment={filters.segment === "loyal" ? "loyal" : "inactive"} />
      {exportError && <div className={styles.error} role="alert">{exportError}</div>}
      {detailError && <div className={styles.error} role="alert">{detailError}<button disabled={detailBusy} onClick={() => void loadDetail(filters)}>إعادة المحاولة</button></div>}
      {detailBusy && <div className={`${styles.panel} ${styles.loading}`} role="status"><p>جارٍ تحميل تفاصيل العلامة</p></div>}
      {detail && detailMatches && <>
        <dl className={styles.metrics}>{[
          ["العملاء المسجلون", number(detail.brand.registeredCustomers), `${number(detail.brand.cardholders)} لديهم بطاقة ولاء`],
          ["عملاء المحفظة", number(detail.brand.walletCustomers), "طلب ملف Apple أو رابط Google"],
          ["أيام الزيارة خلال الفترة", number(detail.brand.visitsInPeriod), "زيارة واحدة لكل عميل في اليوم"],
          ["العملاء العائدون", number(detail.brand.returningCustomers), "عميل زار في يومين مختلفين على الأقل"],
          ["منتظمون خلال ٤ أيام", number(detail.brand.loyalCustomers), "٣ زيارات على الأقل وآخر زيارة خلال ١٠ أيام"],
          ["متوسط الفترة بين الزيارات", detail.brand.averageVisitGapDays === null ? "غير متاح" : `${number(detail.brand.averageVisitGapDays, 1)} يوم`, "من جميع أيام الزيارة المسجلة"],
        ].map(([label, value, hint]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{hint}</small></div>)}</dl>
        {view === "customers" && <section className={`${styles.panel} ${styles.tablePanel}`} aria-labelledby="analytics-customers-title"><div className={styles.heading}><div><h2 id="analytics-customers-title"><Users size={19} aria-hidden="true" />عملاء العلامة</h2><p>بيانات العملاء وتواريخهم والأختام والمكافآت ومتوسط العودة تراكمية حتى وقت التقرير</p></div><span className={styles.count}>{number(detail.total)} عميل مطابق</span></div><form className={styles.toolbar} onSubmit={event => { event.preventDefault(); filterCustomers({ search: searchDraft.trim() }); }}><label>الاسم أو رقم الجوال<span className={styles.search}><Search size={17} aria-hidden="true" /><input type="search" maxLength={100} value={searchDraft} placeholder="ابحث في جميع عملاء العلامة" onChange={event => setSearchDraft(event.target.value)} /></span></label><button type="submit" disabled={detailBusy}>بحث العملاء</button><label>ترتيب العملاء<select value={filters.sort} onChange={event => filterCustomers({ sort: event.target.value as BrandAnalyticsFilters["sort"] })}><option value="recent">آخر نشاط أولًا</option><option value="inactive">الأطول غيابًا</option><option value="visits">الأكثر زيارة</option><option value="name">الاسم</option></select></label></form><div className={styles.segments} aria-label="شرائح عملاء العلامة">{segments.map(segment => <button key={segment.id} aria-pressed={filters.segment === segment.id} onClick={() => filterCustomers({ segment: segment.id })}>{segment.label}</button>)}</div><div className={styles.tableWrap} tabIndex={0} role="region" aria-label="جدول بيانات عملاء العلامة"><table className={styles.customerTable}><thead><tr>{["العميل والجوال", "التسجيل وإصدار البطاقة", "المحفظة", "آخر ختم ومكافأة", "العودة والغياب", "الزيارات والأختام", "السجل"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{detail.customers.map(item => <tr key={item.id}><th scope="row"><button className={styles.customerButton} aria-haspopup="dialog" onClick={event => { selectedCustomerTrigger.current = event.currentTarget; void loadCustomer(item); }}>{item.name || "عميل بدون اسم"}</button><Phone value={item.phone} />{item.isInactive && <div><span className={`${styles.pill} ${styles.warning}`}>منقطع ١٠ أيام</span></div>}{item.isLoyal && <div><span className={`${styles.pill} ${styles.positive}`}>منتظمون خلال ٤ أيام</span></div>}</th><td><DatePair label="التسجيل" value={item.joinedAt} /><DatePair label="أول بطاقة" value={item.cardIssuedAt} empty="لم تصدر بطاقة" /></td><td><DatePair label="أول ملف Apple" value={item.wallet.firstDownloadAt} /><DatePair label="أول رابط Google" value={item.wallet.firstGoogleSaveAt} /><small>{number(item.wallet.installedDevices)} أجهزة Apple مسجلة</small></td><td><DatePair label="آخر ختم" value={item.lastStampAt} /><DatePair label="آخر مكافأة" value={item.lastRedemptionAt} /></td><td><strong>{number(item.inactiveDays)} يوم غياب</strong><small>{item.lastVisitAt ? "منذ آخر زيارة" : "دون زيارة مسجلة"}</small><small>متوسط العودة {item.averageVisitGapDays === null ? "غير متاح" : `${number(item.averageVisitGapDays, 1)} يوم`}</small></td><td><strong>{number(item.visitDays)} يوم زيارة</strong><small>{number(item.totalStamps)} أختام مكتسبة</small><small>{number(item.currentStamps)} رصيد حالي</small><small>{number(item.rewardsRedeemed)} مكافآت مصروفة</small></td><td><button aria-label={`سجل ${item.name || "العميل"}`} aria-haspopup="dialog" onClick={event => { selectedCustomerTrigger.current = event.currentTarget; void loadCustomer(item); }}>عرض التفاصيل</button></td></tr>)}</tbody></table>{!detail.customers.length && <div className={styles.empty}><Users size={26} aria-hidden="true" /><p>لا يوجد عملاء يطابقون البحث والشريحة الحالية</p><button onClick={() => { setSearchDraft(""); filterCustomers({ search: "", segment: "all" }); }}>عرض كل العملاء</button></div>}</div><Pagination page={detail.page} total={detail.total} pageSize={detail.pageSize} busy={detailBusy} onPage={page => void loadDetail({ ...filters, page, asOf: detail.generatedAt })} label="صفحات عملاء العلامة" /></section>}
        {view === "peak" && <Heatmap cells={detail.heatmap} />}
        {view === "retention" && <RetentionPanel brand={detail.brand} cohorts={detail.cohorts} />}
      </>}
    </section> : report && <div id="brand-analytics-detail" className={`${styles.panel} ${styles.empty}`}><CreditCard size={28} aria-hidden="true" /><p>اختر علامة من الجدول لعرض العملاء والذروة والاحتفاظ وتصدير تقريرها الكامل</p></div>}
    <details className={`${styles.panel} ${styles.definitions}`}><summary><Info size={18} aria-hidden="true" />كيف تُحسب الأرقام وما الذي تعنيه</summary><ul><li>العميل المنقطع مضى أكثر من ١٠ أيام على آخر ختم أو صرف مكافأة أو كوبون ولا يُصنّف المسجل الجديد قبل مرور هذه المدة</li><li>العميل المنتظم خلال ٤ أيام لديه ثلاثة أيام زيارة على الأقل في السجل ومتوسط عودة لا يتجاوز ٤ أيام وآخر نشاط خلال ١٠ أيام</li><li>الزيارة تعني ختمًا ناجحًا أو مكافأة أو كوبونًا مصروفًا وكل عمليات العميل في اليوم نفسه تُحسب زيارة واحدة بتوقيت الرياض</li><li>الاحتفاظ يُحسب من أول إصدار للبطاقة والعودة في يوم مختلف ولا يدخل المقام إلا من أكمل مدة القياس</li><li>تجهيز ملف Apple أو إنشاء رابط Google لا يثبت إضافة البطاقة إلى المحفظة تسجيل جهاز Apple يُعرض منفصلًا ولا يتوفر تأكيد تثبيت Google</li><li>قد يظهر العميل تحت أكثر من علامة مجموع العملاء هنا يمثل علاقات العملاء بالعلامات ولا يمثل عدد أشخاص مستقلين عبر المنصة</li><li>القيم غير المسجلة لا تعني أن العميل لم ينزل بطاقته سابقًا الأحداث التاريخية المتاحة تُعرض بحدود دقتها</li>{report && <><li>بداية سجل العمليات <DateTime value={report.recordingStartedAt} /></li><li>بداية سجل طلبات المحفظة <DateTime value={report.walletRecordingStartedAt} /></li></>}</ul></details>
    {selectedCustomer && customer && <dialog className={styles.dialog} aria-labelledby="analytics-customer-title" ref={node => { if (node && !node.open) node.showModal(); }} onClose={closeCustomer} onCancel={closeCustomer}><div className={styles.dialogHeader}><div><h2 id="analytics-customer-title">{customer.name || "عميل بدون اسم"}</h2><p>{selectedBrand?.name}</p><Phone value={customer.phone} /></div><button autoFocus aria-label="إغلاق تفاصيل العميل" onClick={event => event.currentTarget.closest("dialog")?.close()}><X size={18} aria-hidden="true" />إغلاق</button></div><CustomerFacts customer={customer} /><div className={styles.notice}><Info size={17} aria-hidden="true" /><p>تواريخ المحفظة تميز طلب الملف أو رابط الحفظ عن تسجيل جهاز Apple جميع الأوقات بتوقيت الرياض</p></div><h3 style={{ marginTop: 24 }}>السجل الزمني للعميل</h3>{customerError && <div className={styles.error} role="alert">{customerError}<button onClick={() => void loadCustomer(customer)}>إعادة المحاولة</button></div>}{customerBusy ? <p className={styles.loading} role="status">جارٍ تحميل سجل العميل</p> : customerDetail && <><ol className={styles.timeline}>{customerDetail.events.map(event => <li key={event.id}><DateTime value={event.at} /><div><strong>{eventNames[event.kind]}</strong>{event.stampsDelta !== 0 && <p>{event.stampsDelta > 0 ? "+" : ""}{number(event.stampsDelta)} أختام</p>}{event.rewardName && <p>{event.rewardName}</p>}{event.origin === "historical" && <small>سجل تاريخي متاح</small>}</div></li>)}</ol>{!customerDetail.events.length && <p className={styles.empty}>لا توجد أحداث مسجلة لهذا العميل بعد</p>}<Pagination page={customerDetail.page} total={customerDetail.total} pageSize={customerDetail.pageSize} busy={customerBusy} onPage={page => void loadCustomer(customer, page)} label="صفحات السجل الزمني للعميل" /></>}</dialog>}
  </div></AdminPageShell></div>;
}
