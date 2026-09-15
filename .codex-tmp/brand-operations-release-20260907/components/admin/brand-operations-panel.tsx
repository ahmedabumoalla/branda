"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Download, Eye, Gift, LogIn, ScanLine, ShoppingBag } from "lucide-react";
import { fetchBrandOperationsAction } from "@/app/actions/brand-operations";
import type { OperationsMetricKey } from "@/lib/data/admin-operations-center";
import { exportOperationsCenterReportToPdf } from "@/lib/export/admin-report-export";
import { DetailRows } from "./pages/admin-operations-center-page";
import s from "./brand-details.module.css";

const icons = { visits: Eye, appInstallClicks: Download, brandLogins: LogIn, cashierLogins: LogIn, loyaltyScans: ScanLine, rewardRedemptions: Gift, orders: ShoppingBag };
type Result = Awaited<ReturnType<typeof fetchBrandOperationsAction>>;

export function BrandOperationsPanel({ brandId }: { brandId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [request, setRequest] = useState({ from: "", to: "", version: 0 });
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metricKey, setMetricKey] = useState<OperationsMetricKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBrandOperationsAction({ brandId, from: request.from, to: request.to })
      .then(result => { if (!cancelled) { setData(result); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError("تعذر تحميل عمليات العلامة. حاول مجددًا."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [brandId, request]);

  function load(nextFrom: string, nextTo: string) {
    setLoading(true); setError(""); setMetricKey(null);
    setRequest(current => ({ from: nextFrom, to: nextTo, version: current.version + 1 }));
  }
  const brand = data?.brand;
  const metric = brand?.metrics.find(item => item.key === metricKey);

  return <div className={s.operations} aria-busy={loading}>
    <form className={s.operationsFilters} onSubmit={event => { event.preventDefault(); load(from, to); }}>
      <label>من<input type="date" aria-label="بداية فترة العمليات" value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label>إلى<input type="date" aria-label="نهاية فترة العمليات" value={to} onChange={event => setTo(event.target.value)} /></label>
      <button className={s.primaryButton} disabled={loading} type="submit">تطبيق الفترة</button>
      <button className={s.textButton} disabled={loading} type="button" onClick={() => { setFrom(""); setTo(""); load("", ""); }}>كل الفترات</button>
    </form>
    {loading ? <p role="status" className={s.operationNotice}>جارٍ تحميل عمليات العلامة…</p>
      : error ? <div role="alert" className={s.operationNotice}><p>{error}</p><button type="button" className={s.textButton} onClick={() => load(request.from, request.to)}>إعادة المحاولة</button></div>
      : !brand ? <p role="status" className={s.operationNotice}>لا تتوفر بيانات لهذه العلامة.</p>
      : <>
        <div className={s.operationsToolbar}>
          <p>{data.filters.from || data.filters.to ? `${data.filters.from || "البداية"} — ${data.filters.to || "اليوم"}` : "جميع الفترات"}</p>
          <button type="button" className={s.textButton} onClick={() => exportOperationsCenterReportToPdf({ brands: [brand], brand, filters: data.filters })}><Download aria-hidden="true" />تصدير تقرير العلامة</button>
        </div>
        {metric ? <section>
          <button type="button" className={s.textButton} onClick={() => setMetricKey(null)}><ArrowRight aria-hidden="true" />جميع المؤشرات</button>
          <h3 className={s.groupHeading}>{metric.title}</h3>
          {metric.status === "missing" ? <p className={s.operationNotice}>بيانات هذا المؤشر غير متاحة حاليًا.</p> : <DetailRows brand={brand} metric={metric} />}
        </section> : <div className={s.actionGrid}>{brand.metrics.map(item => {
          const Icon = icons[item.key];
          return <button type="button" className={s.actionTile} key={item.key} onClick={() => setMetricKey(item.key)}>
            <span className={s.tileIcon}><Icon aria-hidden="true" /></span>
            <span className={s.tileText}><strong>{item.title}</strong><b className={s.metricValue}>{item.status === "missing" ? "غير متاح" : item.value.toLocaleString("ar-SA")}</b>
              <small>{item.accepted !== undefined || item.rejected !== undefined ? `مقبول: ${item.accepted ?? 0} · مرفوض: ${item.rejected ?? 0}` : item.status === "missing" ? "البيانات غير متاحة حاليًا" : item.status === "empty" ? "لا توجد عمليات خلال الفترة" : "عرض تفاصيل العمليات"}</small>
            </span>
          </button>;
        })}</div>}
      </>}
  </div>;
}
