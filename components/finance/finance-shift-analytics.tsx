"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, Clock3, Download, Package, RefreshCw, Search, ShoppingBag, TrendingUp } from "lucide-react";
import { fetchFinanceShiftAnalyticsAction } from "@/app/actions/finance-shift-analytics";
import { durationParts, shiftHighlights, shiftProductsCsv, type ShiftAnalytics, type ShiftProductAnalytics } from "@/lib/finance/shift-analytics";
import { Numeric } from "./finance-ui";
import s from "./finance-shift-analytics.module.css";

const number = (value: number, decimals = 2) => new Intl.NumberFormat("ar-SA", { maximumFractionDigits: decimals }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { calendar: "gregory", timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
const hour = (value: number) => `${String(value).padStart(2, "0")}:00`;
const estimated = (value: { estimatedCostLineCount: number; legacyCostLineCount: number }) => value.estimatedCostLineCount > 0 || value.legacyCostLineCount > 0;
const paymentNames: Record<string, string> = { cash: "كاش", pos: "شبكة", bank: "بنك", receivable: "آجل" };

export function FinanceShiftAnalytics({ shiftId, slug, visible = true, refreshKey = 0 }: { shiftId: string; slug?: string; visible?: boolean; refreshKey?: number }) {
  const [report, setReport] = useState<ShiftAnalytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  useEffect(() => {
    let active = true, busy = false, closed = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const result = await fetchFinanceShiftAnalyticsAction(shiftId, slug);
        if (!active) return;
        if (result.ok) { closed = !!result.data.closedAt; setReport(result.data); setError(""); } else setError(result.message);
      } catch { if (active) setError("تعذر تحديث التحليل أعد المحاولة"); }
      finally { busy = false; if (active) setLoading(false); }
    }
    void load();
    const timer = setInterval(() => { if (visibleRef.current && !closed && document.visibilityState !== "hidden") void load(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [shiftId, slug, revision, refreshKey]);
  const current = report?.shiftId === shiftId ? report : null;
  return <section className={s.report} aria-label="تحليل أداء الوردية">
    <div className={s.heading}><div><span className={s.eyebrow}><BarChart3 size={15} />قراءة أداء الوردية</span><h3>أرقام تساعدك على القرار</h3></div><button type="button" className={s.button} onClick={() => setRevision(v => v + 1)}><RefreshCw size={15} />تحديث التحليل</button></div>
    {error && <p className={s.warning} role="alert">{error}{current && " البيانات المعروضة من آخر تحديث ناجح"}</p>}
    {!current ? <p className={s.empty} role="status">{loading ? "جار تحليل المبيعات والأصناف والمخزون" : "التحليل غير متاح حاليًا يمكنك إعادة المحاولة"}</p> : <ShiftAnalyticsView key={shiftId} report={current} />}
  </section>;
}

export function ShiftAnalyticsView({ report }: { report: ShiftAnalytics }) {
  const [tab, setTab] = useState<"overview" | "products" | "stock">("overview");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"quantity" | "revenue" | "profit">("quantity");
  const { totals: t } = report;
  const d = durationParts(report.durationSeconds);
  const { sold, profitable, peak } = shiftHighlights(report);
  const stocks = report.products.flatMap(p => p.stock.map(stock => ({ ...stock, key: `${p.key}:${stock.itemId}:${stock.warehouseId}`, name: p.name })));
  const negatives = stocks.filter(stock => stock.quantity < 0);
  const low = stocks.filter(stock => stock.quantity >= 0 && stock.quantity <= stock.minQuantity);
  const products = report.products.filter(p => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === "quantity" ? b.netQuantity - a.netQuantity : sort === "revenue" ? b.revenue - a.revenue : (b.profit ?? -Infinity) - (a.profit ?? -Infinity));
  const maxCount = Math.max(1, ...report.hourly.map(h => h.salesCount));
  function download() {
    const url = URL.createObjectURL(new Blob([shiftProductsCsv(report.products)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `shift-${report.shiftId}-products.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <div className={s.duration}>
      <div><span><Clock3 size={16} />مدة الوردية {report.closedAt ? "النهائية" : "حتى الآن"}</span><strong>{d.days > 0 && `${number(d.days, 0)} يوم و`}{d.hours > 0 && `${number(d.hours, 0)} ساعة و`}{d.totalMinutes < 1 ? "أقل من دقيقة" : `${number(d.minutes, 0)} دقيقة`}</strong><small>من {date(report.openedAt)}{report.closedAt ? ` إلى ${date(report.closedAt)}` : " وحتى وقت التقرير"}</small></div>
      <div className={s.durationReading}>
        <div className={s.durationUnits} aria-label="تفصيل المدة بالأيام والساعات والدقائق"><span><b>{number(d.days, 0)}</b>يوم</span><span><b>{number(d.hours, 0)}</b>ساعة</span><span><b>{number(d.minutes, 0)}</b>دقيقة</span></div>
        <small className={s.durationTotal}>{d.totalMinutes < 1 ? "الإجمالي أقل من دقيقة" : `الإجمالي ${number(Math.floor(d.totalHours), 0)} ساعة و${number(d.minutes, 0)} دقيقة`}</small>
      </div>
    </div>
    <div className={s.metrics}>
      <Metric title="صافي المبيعات" value={<Numeric value={t.netSales} money />} hint="بعد المرتجعات شامل الضريبة" icon={<TrendingUp size={18} />} />
      <Metric title="فواتير البيع" value={number(t.salesCount, 0)} hint={`${number(t.netQuantity, 3)} صافي الوحدات المباعة`} icon={<ShoppingBag size={18} />} />
      <Metric title={estimated(t) ? "الربح الإجمالي التقديري" : "الربح الإجمالي"} value={t.profit == null ? "غير مكتمل" : <Numeric value={t.profit} money />} hint={t.profit == null ? `${number(t.unknownCostLineCount, 0)} بند بلا تكلفة موثقة` : "قبل المصاريف التشغيلية والرسوم"} icon={<BarChart3 size={18} />} />
      <Metric title="متوسط فاتورة البيع" value={<Numeric value={t.averageBasket} money />} hint="قبل طرح المرتجعات شامل الضريبة" icon={<Package size={18} />} />
    </div>
    <div className={s.tabs} role="group" aria-label="أقسام تحليل الوردية">{([{ key: "overview", name: "نظرة تحليلية" }, { key: "products", name: `الأصناف (${number(report.products.length, 0)})` }, { key: "stock", name: `المخزون${negatives.length ? ` · ${number(negatives.length, 0)} بالسالب` : ""}` }] as const).map(item => <button key={item.key} type="button" aria-pressed={tab === item.key} onClick={() => setTab(item.key)}>{item.name}</button>)}</div>
    {tab === "overview" && <>
      <div className={s.highlights}>
        <article><span>الأكثر بيعًا بالصافي</span><strong>{sold?.name ?? "لا توجد مبيعات صافية"}</strong>{sold && <small>{number(sold.netQuantity, 3)} وحدة بعد المرتجعات</small>}</article>
        <article><span>الأعلى ربحًا بين الأصناف ذات التكلفة</span><strong>{profitable?.name ?? "لا تتوفر تكلفة كافية للمقارنة"}</strong>{profitable && <small><Numeric value={profitable.profit!} money />{estimated(profitable) ? " ربح تقديري" : " ربح إجمالي"}</small>}</article>
        <article><span>ساعة الذروة حسب عدد الفواتير</span><strong>{peak ? `${hour(peak.hour)} – ${hour((peak.hour + 1) % 24)}` : "لا توجد فواتير بعد"}</strong>{peak && <small>{number(peak.salesCount, 0)} فاتورة بقيمة <Numeric value={peak.salesTotal} money /></small>}</article>
      </div>
      <div className={s.chartPanel}><div className={s.sectionHeading}><h4>حركة البيع على مدار اليوم</h4><span>عدد الفواتير بتوقيت الرياض</span></div><ol className={s.chart} aria-label="توزيع فواتير الوردية حسب ساعة تسجيلها">{report.hourly.map(h => <li key={h.hour} title={`${hour(h.hour)} · ${number(h.salesCount, 0)} فاتورة · ${number(h.salesTotal)} ر س`} aria-label={`${hour(h.hour)} عدد الفواتير ${h.salesCount} والمبيعات ${h.salesTotal} ريال`}><span className={s.barValue}>{h.salesCount ? number(h.salesCount, 0) : ""}</span><div className={`${s.bar} ${peak?.hour === h.hour ? s.peak : ""}`} style={{ height: `${Math.max(2, h.salesCount / maxCount * 90)}px` }} /><small>{h.hour % 3 === 0 ? hour(h.hour) : ""}</small></li>)}</ol><p className={s.help}>الساعات تجمع فواتير جميع أيام الوردية حسب وقت تسجيلها في النظام{t.offlineSalesCount > 0 ? ` منها ${number(t.offlineSalesCount, 0)} فاتورة محفوظة دون اتصال قد يختلف وقت بيعها الفعلي` : ""}</p></div>
      <div className={s.twoColumns}><section className={s.breakdown}><h4>تفصيل المبيعات</h4><Facts rows={[
        ["المبيعات قبل المرتجعات", t.grossSales], ["المبالغ المرتجعة", t.returnedTotal], ["صافي الإيراد دون الضريبة", t.netRevenue], ["صافي الضريبة", t.tax], ["صافي الخصومات بعد المرتجعات", t.discount], ["تكلفة المبيعات المسجلة بعد المرتجعات", t.cost],
      ]} /><p className={s.help}>{number(t.refundCount, 0)} سند مرتجع · {number(t.returnedQuantity, 3)} وحدة مرتجعة · تغطية بيانات التكلفة {number(t.costCoveragePercent)}٪</p></section><section className={s.breakdown}><h4>التحصيل وطرق السداد</h4>{!report.payments.length ? <p className={s.empty}>لا توجد مبالغ محصلة</p> : <ul className={s.payments}>{report.payments.map((p, i) => <li key={`${p.kind}:${p.accountName}:${i}`}><div><strong>{paymentNames[p.kind] ?? p.kind}</strong><small>{p.accountName}</small></div><div><Numeric value={p.netPaid} money />{p.returnedPaid > 0 && <small>مرتجع <Numeric value={p.returnedPaid} money /></small>}</div></li>)}</ul>}<p className={s.help}>التحصيل الصافي لفواتير الوردية وتسديداتها حتى وقت التقرير بعد رد المبالغ</p></section></div>
      {(negatives.length > 0 || low.length > 0 || t.unknownCostLineCount > 0) && <div className={s.attention}><h4>تحتاج انتباهك</h4><ul>{negatives.length > 0 && <li>{number(negatives.length, 0)} رصيد مخزني بالسالب راجع التوريد والجرد من تبويب المخزون</li>}{low.length > 0 && <li>{number(low.length, 0)} رصيد وصل إلى حد إعادة الطلب أو نفد</li>}{t.unknownCostLineCount > 0 && <li>راجع الأصناف غير الموثقة وسجل تكلفتها للمبيعات القادمة بيانات البيع التاريخية تبقى محفوظة</li>}</ul></div>}
    </>}
    {tab === "products" && <><div className={s.filters}><label><Search size={16} /><input aria-label="البحث في أصناف الوردية" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث عن صنف" /></label><select aria-label="ترتيب أصناف الوردية" value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="quantity">الأكثر بيعًا</option><option value="revenue">الأعلى إيرادًا</option><option value="profit">الأعلى ربحًا</option></select><button className={s.button} onClick={download}><Download size={15} />تحميل الأصناف</button></div><div className={s.tableWrap}><table><thead><tr><th>الصنف</th><th>المباع</th><th>المرتجع</th><th>الصافي</th><th>الإيراد دون الضريبة</th><th>التكلفة المسجلة</th><th>الربح الإجمالي</th></tr></thead><tbody>{products.map(p => <tr key={p.key}><td><strong>{p.name}</strong><small>{p.tracked ? "مرتبط بالمخزون" : "غير متتبع مخزنيًا"}</small></td><td>{number(p.soldQuantity, 3)}</td><td>{number(p.returnedQuantity, 3)}</td><td>{number(p.netQuantity, 3)}</td><td><Numeric value={p.revenue} money /></td><td><Numeric value={p.cost} money /><small>{p.unknownCostLineCount ? "بيانات غير مكتملة" : estimated(p) ? "تشمل تكلفة تقديرية أو تاريخية" : "مسجلة"}</small></td><td><ProductProfit product={p} /></td></tr>)}</tbody></table>{!products.length && <p className={s.empty}>لا توجد أصناف مطابقة</p>}</div></>}
    {tab === "stock" && <><p className={s.help}>الأرصدة الحالية لأصناف الوردية حسب المستودع وقت التقرير وليست أرصدة لحظة إقفال الوردية البيع بالسالب متاح ويظهر هنا للمراجعة</p><div className={s.tableWrap}><table><thead><tr><th>الصنف</th><th>المستودع</th><th>المتبقي الآن</th><th>حد إعادة الطلب</th><th>الحالة</th></tr></thead><tbody>{stocks.map(p => <tr key={p.key}><td><strong>{p.name}</strong></td><td>{p.warehouseName}</td><td className={p.quantity < 0 ? s.negative : ""}><b dir="ltr">{number(p.quantity, 3)}</b> {p.unit}</td><td>{number(p.minQuantity, 3)} {p.unit}</td><td><span className={p.quantity < 0 ? s.negativeBadge : p.quantity <= p.minQuantity ? s.lowBadge : s.goodBadge}>{p.quantity < 0 ? "رصيد سالب" : p.quantity === 0 ? "نفد المخزون" : p.quantity <= p.minQuantity ? "قارب النفاد" : "متوفر"}</span></td></tr>)}</tbody></table>{!stocks.length && <p className={s.empty}>أصناف هذه الوردية غير مرتبطة بأرصدة مخزنية مسجلة</p>}</div><p className={s.help}>الأصناف غير المتتبعة لا يعرض لها رصيد افتراضي</p></>}
    <footer className={s.reportNotes}><p>الربح الإجمالي = الإيراد بعد الخصومات والمرتجعات دون الضريبة − التكلفة المحفوظة مع البيع ويستثني المصاريف والرسوم وتسويات تقييم المخزون اللاحقة{estimated(t) ? " بعض التكاليف تقديرية أو تاريخية ولا تمثل ربحًا نهائيًا" : ""}</p><p>المرتجعات تشمل ما ارتبط بفواتير هذه الوردية حتى وقت التقرير ولو حدث بعد إقفالها الفواتير التي لم تصل من الأجهزة غير مشمولة</p><time dateTime={report.generatedAt}>آخر تحديث {date(report.generatedAt)}</time></footer>
  </>;
}

function Metric({ title, value, hint, icon }: { title: string; value: React.ReactNode; hint: string; icon: React.ReactNode }) {
  return <article className={s.metric}><span>{icon}{title}</span><strong>{value}</strong><small>{hint}</small></article>;
}
function Facts({ rows }: { rows: [string, number][] }) { return <dl className={s.facts}>{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd><Numeric value={value} money /></dd></div>)}</dl>; }
function ProductProfit({ product }: { product: ShiftProductAnalytics }) {
  if (product.profit == null) return <span className={s.unknown}>غير مكتمل</span>;
  return <span className={product.profit < 0 ? s.negative : ""}><Numeric value={product.profit} money />{estimated(product) && <small>تقديري</small>}</span>;
}
