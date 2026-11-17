"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpLeft, Factory, Gift, RefreshCw, Store, FlaskConical, CircleAlert } from "lucide-react";
import { readAldeemRealOverview } from "@/app/actions/aldeem-overview";
import { overviewPeriod, type OverviewDepartment, type OverviewFilters, type OverviewWork, type RealOverview } from "@/lib/aldeem/overview";
import styles from "./real-overview.module.css";

const departments: [OverviewDepartment, string][] = [["all", "كل الأقسام"], ["sales", "الفروع والمبيعات"], ["lab", "المعمل"], ["manufacturing", "المصنع"], ["loyalty", "نقاط الولاء"]];
const statusLabels: Record<string, string> = { requested: "طلب جديد", preparing: "قيد التجهيز", on_hold: "موقوف للجودة", prepared: "جاهز للتسليم", out_for_delivery: "في التوصيل", delivered: "تم التسليم", recalled: "مستدعى", cancelled: "ملغي", draft: "مسودة", ready: "جاهز للإنتاج", in_progress: "قيد التصنيع", completed: "مكتمل", active: "نشط", inactive: "غير نشط" };
const number = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 2 });
const money = (n: number) => `${n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر س`;
const date = (value: string) => new Date(value).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}
function SourceError({ text }: { text: string }) { return <p role="alert" className={styles.error}><CircleAlert size={18} aria-hidden="true" />{text} — استخدم تحديث لإعادة المحاولة</p>; }

export function AldeemRealOverview({ onNavigate }: { onNavigate?: (section: string) => void } = {}) {
  const [filters, setFilters] = useState<OverviewFilters>(() => ({ ...overviewPeriod(30), branch: null, department: "all" }));
  const [draft, setDraft] = useState(() => overviewPeriod(30));
  const [period, setPeriod] = useState<number | null>(30);
  const [data, setData] = useState<RealOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  // Reuse only this mounted view's request when development Strict Mode replays
  // its effect. Refresh/filter changes always create a new authorized request.
  const request = useRef<{ key: string; promise: ReturnType<typeof readAldeemRealOverview> } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const key = JSON.stringify({ filters, refresh });
    if (request.current?.key !== key) request.current = { key, promise: readAldeemRealOverview(filters) };
    request.current.promise.then(result => {
      if (!active) return;
      if (result.ok) setData(result.data); else setError(result.message);
    }).catch(() => { if (active) setError("تعذر الاتصال بالسجلات أعد المحاولة"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, refresh]);

  const branchName = (id: string | null) => id ? data?.branches.find(b => b.id === id)?.name ?? "فرع مؤرشف" : "غير مرتبط بفرع";
  const go = (title: string, section: string) => onNavigate && <button type="button" className={styles.link} onClick={() => onNavigate(section)}>{title}<ArrowUpLeft size={16} aria-hidden="true" /></button>;
  const choosePeriod = (days: number) => { const range = overviewPeriod(days); setPeriod(days); setDraft(range); setFilters(v => ({ ...v, ...range })); };
  const sales = data?.sales?.data;
  const lab = data?.lab?.data;
  const manufacturing = data?.manufacturing?.data;
  const loyalty = data?.loyalty?.data;
  const current = data?.current?.data;
  const branchIds = new Set<string | null>([
    ...(data?.branches.filter(b => !data.filters.branch || b.id === data.filters.branch).map(b => b.id) ?? []),
    ...(sales?.byBranch.map(b => b.branchId) ?? []), ...(lab?.byBranch.map(b => b.branchId) ?? []),
    ...(manufacturing?.byBranch.map(b => b.branchId) ?? []), ...(loyalty?.byBranch.map(b => b.branchId) ?? []),
  ]);
  const show = (department: OverviewDepartment) => filters.department === "all" || filters.department === department;
  function WorkTable({ rows }: { rows: OverviewWork[] }) {
    return rows.length ? <div className={styles.tableScroll}><table><thead><tr><th>الطلب</th><th>الفرع</th><th>الحالة الحالية</th><th>إنشاء الطلب</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.name || `#${row.number}`}</strong>{row.name && <small>{row.number}</small>}</td><td>{branchName(row.branchId)}</td><td><span className={styles.status}>{statusLabels[row.status] ?? row.status}</span></td><td>{date(row.createdAt)}{row.requiredAt && <small>التسليم المطلوب {date(row.requiredAt)}</small>}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>لا توجد طلبات مسجلة ضمن الفترة والفرع المحددين</p>;
  }

  return <div className={styles.root} dir="rtl">
    <header className={styles.header}><div><p className={styles.eyebrow}>الديم من الفروع إلى الإنتاج</p><h2>نظرة على أعمال المنصة</h2><p>المبيعات وطلبات المعمل والمصنع وحركة الولاء من سجلات الحساب الفعلية</p></div><button type="button" className={styles.primary} onClick={() => setRefresh(v => v + 1)} disabled={loading}><RefreshCw size={17} aria-hidden="true" />{loading ? "جار التحديث" : "تحديث"}</button></header>
    <section className={styles.filters} aria-label="تصفية النظرة العامة">
      <div className={styles.periods}>{[[1, "اليوم"], [7, "آخر ٧ أيام"], [30, "آخر ٣٠ يومًا"]].map(([days, label]) => <button key={days} type="button" aria-pressed={period === days} onClick={() => choosePeriod(Number(days))}>{label}</button>)}<button type="button" aria-pressed={period === null} onClick={() => setPeriod(null)}>فترة مخصصة</button></div>
      <div className={styles.filterFields}><label>الفرع<select value={filters.branch ?? ""} onChange={event => setFilters(v => ({ ...v, branch: event.target.value || null }))}><option value="">{data?.scopeBranch ? "فرع العمل الحالي" : "جميع الفروع"}</option>{data?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>{period === null && <form className={styles.customDates} onSubmit={event => { event.preventDefault(); setFilters(v => ({ ...v, ...draft })); }}><label>من تاريخ<input required type="date" value={draft.from} max={draft.to} onChange={event => setDraft(v => ({ ...v, from: event.target.value }))} /></label><label>إلى تاريخ<input required type="date" value={draft.to} min={draft.from} onChange={event => setDraft(v => ({ ...v, to: event.target.value }))} /></label><button type="submit" className={styles.primary}>تطبيق الفترة</button></form>}</div>
      <div className={styles.departments} aria-label="القسم">{departments.map(([key, title]) => <button key={key} type="button" aria-pressed={filters.department === key} onClick={() => setFilters(v => ({ ...v, department: key }))}>{title}</button>)}</div>
    </section>
    {error && <SourceError text={error} />}
    {loading ? <div className={styles.loading} role="status"><RefreshCw size={22} aria-hidden="true" /><span>نقرأ سجلات الفترة والفرع المحددين</span></div> : !error && data && <>
      <div className={styles.context}><strong>{data.filters.branch ? branchName(data.filters.branch) : "جميع الفروع"} · {data.filters.from} — {data.filters.to}</strong><span>آخر قراءة {date(data.at)} بتوقيت الرياض</span></div>
      <section className={styles.current}><div className={styles.sectionTitle}><div><h3>الوضع الحالي</h3><p>لحظة آخر قراءة للفرع المحدد مستقلة عن فترة إنشاء العمليات</p></div></div>{data.current.error ? <SourceError text={data.current.error} /> : current && <div className={styles.metrics}>
        {show("sales") && <><Metric label="نقاط البيع المفعلة" value={number(current.points)} /><Metric label="ورديات نقاط البيع المفتوحة" value={number(current.openShifts)} /></>}
        {show("lab") && <><Metric label="طلبات المعمل غير المسلمة" value={number(current.labPending)} /><Metric label="طلبات موقوفة للجودة" value={number(current.labHeld)} /></>}
        {show("manufacturing") && <Metric label="أوامر المصنع غير المكتملة" value={number(current.manufacturingPending)} />}
        {show("loyalty") && current.outstandingPoints !== null && <Metric label="رصيد نقاط العملاء المتاح" value={number(current.outstandingPoints)} hint="رصيد موحد عبر الفروع بعد احتساب الصلاحية" />}
        {show("loyalty") && current.outstandingPoints === null && <p className={styles.note}>رصيد العميل مشترك بين الفروع ويظهر عند اختيار جميع الفروع</p>}
      </div>}</section>

      {show("sales") && <section className={styles.panel}><div className={styles.sectionTitle}><div><h3><Store size={20} aria-hidden="true" />الفروع والمبيعات</h3><p>عمليات البيع والمرتجعات الصادرة في الفترة المحددة والمبالغ شاملة الضريبة</p></div>{go("سجل الفواتير", "sales-invoices")}</div>{data.sales?.error ? <SourceError text={data.sales.error} /> : sales && <>
        <div className={styles.metrics}><Metric label="صافي المبيعات بعد المرتجعات" value={money(sales.net)} /><Metric label="فواتير المبيعات" value={number(sales.invoices)} /><Metric label="مرتجعات المبيعات" value={money(sales.refunds)} hint={`${number(sales.refundCount)} مستند مرتجع`} /><Metric label="متوسط فاتورة البيع" value={sales.invoices ? money(sales.gross / sales.invoices) : "—"} /><Metric label="صافي الضريبة المسجلة" value={money(sales.tax)} /></div>
        <div className={styles.chart}><h4>حركة المبيعات اليومية</h4>{sales.days.length ? <div className={styles.chartBars} role="list" aria-label="صافي المبيعات لكل يوم في الفترة">{sales.days.map(day => <div key={day.day} role="listitem" className={styles.day} title={`${day.day}: ${money(day.sales)}`}><span>{money(day.sales)}</span><div className={styles.barTrack}><i className={day.sales < 0 ? styles.negative : ""} style={{ height: `${Math.max(2, Math.abs(day.sales) / Math.max(1, ...sales.days.map(d => Math.abs(d.sales))) * 100)}%` }} /></div><small>{day.day.slice(5)}</small></div>)}</div> : <p className={styles.empty}>لا توجد مبيعات أو مرتجعات في الفترة المحددة</p>}</div>
      </>}</section>}

      <section className={styles.panel}><div className={styles.sectionTitle}><div><h3>مقارنة الفروع</h3><p>إجماليات الفترة حسب القسم المختار والسجلات غير المرتبطة بفرع معروضة منفصلة</p></div>{go("إدارة نقاط البيع", "branch-pos-management")}</div><div className={styles.tableScroll}><table><thead><tr><th>الفرع</th>{show("sales") && <><th>صافي المبيعات</th><th>فواتير البيع</th></>}{show("lab") && <th>طلبات المعمل</th>}{show("manufacturing") && <th>أوامر المصنع</th>}{show("loyalty") && <><th>نقاط مكتسبة</th><th>نقاط مستبدلة</th></>}</tr></thead><tbody>{[...branchIds].map(id => <tr key={id ?? "unassigned"}><td>{branchName(id)}</td>{show("sales") && <><td>{sales ? money(sales.byBranch.find(b => b.branchId === id)?.sales ?? 0) : "غير متاح"}</td><td>{sales ? number(sales.byBranch.find(b => b.branchId === id)?.invoices ?? 0) : "غير متاح"}</td></>}{show("lab") && <td>{lab ? number(lab.byBranch.find(b => b.branchId === id)?.count ?? 0) : "غير متاح"}</td>}{show("manufacturing") && <td>{manufacturing ? number(manufacturing.byBranch.find(b => b.branchId === id)?.count ?? 0) : "غير متاح"}</td>}{show("loyalty") && <><td>{loyalty ? number(loyalty.byBranch.find(b => b.branchId === id)?.earned ?? 0) : "غير متاح"}</td><td>{loyalty ? number(loyalty.byBranch.find(b => b.branchId === id)?.redeemed ?? 0) : "غير متاح"}</td></>}</tr>)}</tbody></table>{branchIds.size === 0 && <p className={styles.empty}>لا توجد فروع أو عمليات ضمن الاختيار الحالي</p>}</div></section>

      <div className={styles.workGrid}>
        {show("lab") && <section className={styles.panel}><div className={styles.sectionTitle}><div><h3><FlaskConical size={20} aria-hidden="true" />طلبات المعمل</h3><p>طلبات أنشئت في الفترة مع حالتها الحالية</p></div>{go("فتح الطلبات", "workshop-branch-requests")}</div>{data.lab?.error ? <SourceError text={data.lab.error} /> : lab && <><div className={styles.statuses}><strong>{number(lab.total)} طلب</strong>{lab.statuses.map(item => <span key={item.status}>{statusLabels[item.status] ?? item.status}<b>{number(item.count)}</b></span>)}</div><h4>أحدث الطلبات في الفترة</h4><WorkTable rows={lab.recent} /></>}</section>}
        {show("manufacturing") && <section className={styles.panel}><div className={styles.sectionTitle}><div><h3><Factory size={20} aria-hidden="true" />عمليات المصنع</h3><p>أوامر أنشئت في الفترة مع حالة الإنتاج الحالية</p></div>{go("فتح التصنيع", "manufacturing-operations")}</div>{data.manufacturing?.error ? <SourceError text={data.manufacturing.error} /> : manufacturing && <><div className={styles.statuses}><strong>{number(manufacturing.total)} أمر تصنيع</strong>{manufacturing.statuses.map(item => <span key={item.status}>{statusLabels[item.status] ?? item.status}<b>{number(item.count)}</b></span>)}</div><h4>أحدث أوامر التصنيع في الفترة</h4><WorkTable rows={manufacturing.recent} /></>}<div className={styles.shortcuts}>{go("مركز الجودة", "manufacturing-quality")}{go("تقارير الجودة", "manufacturing-quality-reports")}{go("تتبع الباتشات", "manufacturing-batches")}</div></section>}
      </div>
      {show("loyalty") && <section className={styles.panel}><div className={styles.sectionTitle}><div><h3><Gift size={20} aria-hidden="true" />حركة نقاط الولاء</h3><p>الاكتساب والاستبدال المسجلان في الفترة للفرع المحدد</p></div>{go("حسابات نقاط العملاء", "customer-points")}</div>{data.loyalty?.error ? <SourceError text={data.loyalty.error} /> : loyalty && <div className={styles.metrics}><Metric label="النقاط المكتسبة" value={number(loyalty.earned)} /><Metric label="النقاط المستبدلة" value={number(loyalty.redeemed)} /><Metric label="قيمة الاستبدال" value={money(loyalty.redeemedValue)} /><Metric label="عملاء لديهم حركة نقاط" value={number(loyalty.customers)} /><Metric label="تسويات المرتجعات بالنقاط" value={number(loyalty.reversed)} /><Metric label="التعديلات الإدارية بالنقاط" value={number(loyalty.adjusted)} /></div>}</section>}
      {sales && <section className={styles.panel}><div className={styles.sectionTitle}><div><h3>أحدث العمليات المالية في الفترة</h3><p>آخر ٨ عمليات فقط والإجماليات أعلاه تشمل جميع العمليات المطابقة</p></div>{go("جميع الفواتير", "sales-invoices")}</div>{sales.recent.length ? <div className={styles.tableScroll}><table><thead><tr><th>المستند</th><th>النوع</th><th>الفرع</th><th>الإصدار بتوقيت الرياض</th><th>الإجمالي</th></tr></thead><tbody>{sales.recent.map(row => <tr key={row.id}><td>#{row.number}</td><td>{row.kind === "sale" ? "فاتورة بيع" : "مرتجع بيع"}</td><td>{branchName(row.branchId)}</td><td>{date(row.createdAt)}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>لا توجد عمليات مالية في الفترة المحددة</p>}</section>}
    </>}
  </div>;
}
