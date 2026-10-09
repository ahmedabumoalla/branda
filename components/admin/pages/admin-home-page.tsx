"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowDownLeft, ArrowUpLeft, BarChart3, Building2, Check, ChevronLeft, Clock3, FileImage, Layers3, Minus, Package, Search, ShieldCheck, Users, Wrench } from "lucide-react";
import type { AdminDashboardOverview, AdminMonthlyRevenuePoint } from "@/lib/data/admin-dashboard";
import s from "./admin-home-page.module.css";

type Props = { overview: AdminDashboardOverview; configError?: string };
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function Money({ value }: { value: number }) {
  return <span className={s.money}><bdi>{number.format(value)}</bdi><small>ريال</small></span>;
}

export function GrowthIndicator({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined || (previous === 0 && current > 0)) return <span className={s.neutral}>لا تتوفر مقارنة نسبية</span>;
  const change = previous === 0 ? 0 : (current - previous) / previous * 100;
  const Icon = change > 0 ? ArrowUpLeft : change < 0 ? ArrowDownLeft : Minus;
  return <span className={change > 0 ? s.positive : change < 0 ? s.negative : s.neutral}>
    <Icon aria-hidden="true" /><bdi>{number.format(Math.abs(change))}%</bdi><span>{change > 0 ? "ارتفاع" : change < 0 ? "انخفاض" : "دون تغير"}</span>
  </span>;
}

export function RevenueChart({ months }: { months: AdminMonthlyRevenuePoint[] }) {
  const [range, setRange] = useState(12);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const visible = months.slice(-range);
  const selected = visible.find(month => month.monthKey === selectedKey) ?? visible.at(-1);
  const peak = Math.max(0, ...visible.map(month => month.revenue));
  const total = visible.reduce((sum, month) => sum + month.revenue, 0);
  const scale = peak > 0 ? Math.ceil(peak / 4) * 4 : 1;
  const chooseRange = (next: number) => { setRange(next); setSelectedKey(null); };

  return <section className={s.chartPanel} aria-labelledby="revenue-title">
    <div className={s.panelHeading}>
      <div><p className={s.eyebrow}>أداء الاشتراكات</p><h2 id="revenue-title">الإيرادات عبر الأشهر</h2></div>
      <div className={s.segmented} role="group" aria-label="فترة عرض الإيرادات">
        {[6, 12].map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => chooseRange(value)}>{value === 6 ? "٦ أشهر" : "١٢ شهرًا"}</button>)}
      </div>
    </div>
    <div className={s.chartSummary}>
      <div><span>إجمالي الفترة</span><strong><Money value={total} /></strong></div>
      <p><i aria-hidden="true" />قيمة الاشتراكات بالريال</p>
    </div>
    {peak > 0 ? <div className={s.chartScroll} role="region" aria-label="الرسم الشهري للإيرادات" tabIndex={0}>
      <div className={s.chartCanvas}>
        <div className={s.axis} aria-hidden="true">{[scale, scale / 2, 0].map(tick => <span key={tick}>{number.format(tick)}</span>)}</div>
        <div className={s.plot} style={{ "--months": visible.length } as CSSProperties}>
          {visible.map(month => <button type="button" className={s.month} key={month.monthKey}
            aria-label={`${month.monthLabel} ${month.monthKey.slice(0, 4)} بقيمة ${number.format(month.revenue)} ريال وعدد ${month.subscriptionsCount} اشتراك`}
            aria-pressed={selected?.monthKey === month.monthKey} onClick={() => setSelectedKey(month.monthKey)} onFocus={() => setSelectedKey(month.monthKey)}>
            <span className={s.barTrack}><span className={s.bar} style={{ height: `${month.revenue / scale * 100}%` }} /></span>
            <span className={s.monthLabel}>{month.monthLabel}</span>
          </button>)}
        </div>
      </div>
    </div> : <div className={s.chartEmpty}><BarChart3 aria-hidden="true" /><h3>لا توجد إيرادات مسجلة في هذه الفترة</h3><p>ستظهر المقارنة عند تسجيل اشتراكات بقيمة مالية</p></div>}
    {selected && <div className={s.monthDetail} role="status" aria-live="polite" aria-atomic="true">
      <span>{selected.monthLabel} <bdi>{selected.monthKey.slice(0, 4)}</bdi></span>
      <strong><Money value={selected.revenue} /></strong><span>{number.format(selected.subscriptionsCount)} اشتراك</span>
    </div>}
    <details className={s.dataDetails}><summary>عرض البيانات الشهرية كجدول</summary>
      <div className={s.tableScroll} role="region" aria-label="البيانات الشهرية للإيرادات" tabIndex={0}><table>
        <caption className={s.srOnly}>قيمة الاشتراكات حسب شهر البداية للفترة المحددة</caption>
        <thead><tr><th scope="col">الشهر</th><th scope="col">قيمة الاشتراكات</th><th scope="col">عدد الاشتراكات</th></tr></thead>
        <tbody>{visible.map(month => <tr key={month.monthKey}><th scope="row">{month.monthLabel} <bdi>{month.monthKey.slice(0, 4)}</bdi></th><td><Money value={month.revenue} /></td><td>{number.format(month.subscriptionsCount)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}

const shortcuts = [
  { title: "العلامات التجارية", hint: "إدارة البيانات والخدمات", href: "/admin/cafes", icon: Building2 },
  { title: "الباقات والاشتراكات", hint: "مراجعة الباقات وأسعارها", href: "/admin/plans", icon: Layers3 },
  { title: "تقارير العمليات", hint: "متابعة أداء العلامات", href: "/admin/operations", icon: BarChart3 },
  { title: "وضع الصيانة", hint: "الدخول إلى لوحة العلامة", href: "/admin/maintenance", icon: Wrench },
];

export function AdminHomePage({ overview, configError }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const terms = query.trim().toLocaleLowerCase();
  const items = overview.auditItems.filter(item => (!category || item.entityLabel === category) && `${item.title} ${item.cafeName} ${item.actorName} ${item.actorEmail}`.toLocaleLowerCase().includes(terms));
  const categories = [...new Set(overview.auditItems.map(item => item.entityLabel))];
  const previous = overview.monthlyRevenue.at(-2);
  const current = overview.monthlyRevenue.at(-1);
  const cards = [
    { title: "العلامات التجارية", value: overview.totalCafes, hint: `${number.format(overview.activeCafes)} علامة نشطة`, icon: Building2, href: "/admin/cafes" },
    { title: "المنتجات المعروضة", value: overview.totalProducts, hint: "منتجات متاحة عبر العلامات", icon: Package },
    { title: "العملاء المسجلون", value: overview.totalCustomers, hint: "عبر جميع العلامات", icon: Users, href: "/admin/customers" },
    { title: "الاشتراكات النشطة", value: overview.activeSubscriptions, hint: "تشمل الاشتراكات التجريبية", icon: Layers3 },
    { title: "مشاركات التجربة", value: overview.totalExperienceSubmissions, hint: "مشاركات العملاء المصورة", icon: FileImage },
  ];

  return <div className={s.page} dir="rtl">
    <header className={s.header}>
      <div><p className={s.eyebrow}><span aria-hidden="true" />لوحة إدارة برندة</p><h1>المنصة في نظرة واحدة</h1><p className={s.subtitle}>تابع نمو العلامات وأداء الاشتراكات وآخر التغييرات</p></div>
      <div className={s.headerActions}><Link href="/admin/operations" className={s.secondaryLink}><BarChart3 aria-hidden="true" />تقارير العمليات</Link><Link href="/admin/cafes" className={s.primaryLink}>إدارة العلامات<ArrowLeft aria-hidden="true" /></Link></div>
    </header>
    {configError ? <section className={s.errorPanel} role="alert"><ShieldCheck aria-hidden="true" /><h2>تعذر عرض مؤشرات المنصة</h2><p>{configError}</p><p>أعد المحاولة لتحميل البيانات الحالية</p><button type="button" className={s.primaryLink} onClick={() => window.location.reload()}>إعادة المحاولة</button></section> : <>
      <section className={s.stats} aria-label="مؤشرات المنصة">
        {cards.map(({ title, value, hint, icon: Icon, href }) => <article className={s.stat} key={title}>
          <div className={s.statHeading}><span className={s.statIcon}><Icon aria-hidden="true" /></span><h2>{title}</h2>{href && <Link href={href} aria-label={`عرض ${title}`} className={s.statLink}><ArrowLeft aria-hidden="true" /></Link>}</div>
          <strong className={s.statValue}><bdi>{number.format(value)}</bdi></strong><p>{hint}</p>
        </article>)}
      </section>
      <div className={s.revenueLayout}>
        <section className={s.revenueSummary} aria-labelledby="month-revenue-title">
          <div className={s.revenueTop}><span className={s.pill}>هذا الشهر</span><span>{current?.monthLabel} <bdi>{current?.monthKey.slice(0, 4)}</bdi></span></div>
          <h2 id="month-revenue-title">قيمة الاشتراكات الشهرية</h2><div className={s.revenueValue}><Money value={overview.currentMonthRevenue} /></div>
          <GrowthIndicator current={overview.currentMonthRevenue} previous={previous?.revenue} /><p className={s.comparison}>مقارنة بالشهر السابق</p>
          <dl className={s.revenueTotals}><div><dt>الشهر السابق</dt><dd>{previous ? <Money value={previous.revenue} /> : "غير متاح"}</dd></div><div><dt>إجمالي آخر ١٢ شهرًا</dt><dd><Money value={overview.totalRevenueLast12Months} /></dd></div></dl>
          <p className={s.revenueNote}>قيمة الاشتراكات النشطة والتجريبية حسب شهر بدايتها</p>
        </section>
        <RevenueChart months={overview.monthlyRevenue} />
      </div>
      <div className={s.bottomLayout}>
        <section className={s.auditPanel} aria-labelledby="audit-title">
          <div className={s.panelHeading}><div><p className={s.eyebrow}>متابعة النشاط</p><h2 id="audit-title">سجل العمليات والتغييرات</h2></div><span className={s.recordCount}><Clock3 aria-hidden="true" />أحدث {number.format(overview.auditItems.length)} عملية</span></div>
          {overview.auditItems.length > 0 && <div className={s.filters}>
            <label className={s.search}><Search aria-hidden="true" /><span className={s.srOnly}>البحث في أحدث العمليات</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث عن عملية أو علامة أو منفذ" /></label>
            <label className={s.category}><span className={s.srOnly}>نوع العملية</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">كل الأقسام</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>}
          <div className={s.tableScroll} role="region" aria-label="سجل العمليات والتغييرات" tabIndex={0}><table className={s.auditTable}>
            <caption className={s.srOnly}>أحدث العمليات المسجلة مع العلامة والمنفذ والتوقيت</caption>
            <thead><tr><th scope="col">العملية</th><th scope="col">العلامة</th><th scope="col">المنفذ</th><th scope="col">التوقيت</th></tr></thead>
            <tbody>{items.map(item => <tr key={item.id}>
              <td><div className={s.operation}><span className={s.eventIcon}><ShieldCheck aria-hidden="true" /></span><div><strong dir="auto">{item.title}</strong><span className={s.entity}>{item.entityLabel}</span></div></div></td>
              <td><span dir="auto">{item.cafeName}</span></td><td><span dir="auto">{item.actorName}</span>{item.actorEmail && <bdi className={s.email}>{item.actorEmail}</bdi>}</td>
              <td className={s.dateCell}><span>{item.dateLabel}</span><span>{item.timeLabel}</span></td>
            </tr>)}</tbody>
          </table></div>
          {!items.length && <div className={s.auditEmpty}><Search aria-hidden="true" /><h3>{overview.auditItems.length ? "لا توجد نتائج مطابقة" : "لا توجد عمليات مسجلة بعد"}</h3><p>{overview.auditItems.length ? "جرّب اسمًا آخر أو أزل التصفية" : "ستظهر هنا التغييرات التي تتم على المنصة"}</p>{overview.auditItems.length > 0 && <button type="button" className={s.resetButton} onClick={() => { setQuery(""); setCategory(""); }}>إزالة التصفية</button>}</div>}
          <footer className={s.auditFooter}><span role="status">عرض {number.format(items.length)} من {number.format(overview.auditItems.length)} عملية حديثة</span><span><Check aria-hidden="true" />سجل التغييرات المسجلة</span></footer>
        </section>
        <aside className={s.shortcuts} aria-labelledby="shortcuts-title"><p className={s.eyebrow}>إدارة يومية أسهل</p><h2 id="shortcuts-title">الوصول السريع</h2><p className={s.shortcutsIntro}>انتقل مباشرة إلى أدوات إدارة المنصة</p>
          <nav aria-label="اختصارات إدارة المنصة">{shortcuts.map(({ title, hint, href, icon: Icon }) => <Link href={href} key={href}><span className={s.shortcutIcon}><Icon aria-hidden="true" /></span><span><strong>{title}</strong><small>{hint}</small></span><ChevronLeft aria-hidden="true" /></Link>)}</nav>
          <div className={s.shortcutsNote}><ShieldCheck aria-hidden="true" /><p>يمكنك دخول وضع الصيانة مباشرة من ملف أي علامة</p></div>
        </aside>
      </div>
    </>}
  </div>;
}
