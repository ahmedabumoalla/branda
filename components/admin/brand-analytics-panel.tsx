"use client";

import { useEffect, useState } from "react";
import { loadBrandAnalyticsAction } from "@/app/actions/brand-analytics";
import type { BrandAnalytics } from "@/lib/analytics/brand-analytics";
import s from "./brand-details.module.css";
import a from "./brand-analytics.module.css";

const number = (value: number) => value.toLocaleString("ar-SA");
const recordedDate = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(value));
function Metric({ title, value, detail }: { title: string; value: number; detail: string }) {
  return <div className={a.metric}><dt>{title}</dt><dd><strong className={a.value}>{number(value)}</strong><span className={a.detail}>{detail}</span></dd></div>;
}

export function BrandAnalyticsPanel({ brandId }: { brandId: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [request, setRequest] = useState({ from: "", to: "", version: 0 });
  const [data, setData] = useState<BrandAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    loadBrandAnalyticsAction({ brandId, from: request.from, to: request.to }).then(result => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else { setData(null); setError(result.message); }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) { setData(null); setError("تعذر تحميل الإحصاءات أعد المحاولة"); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [brandId, request]);
  function load(nextFrom: string, nextTo: string) {
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setError("اختر تاريخ نهاية يساوي تاريخ البداية أو يأتي بعده"); setData(null); return;
    }
    setData(null); setLoading(true); setError("");
    setRequest(current => ({ from: nextFrom, to: nextTo, version: current.version + 1 }));
  }
  const engagement = data?.engagement;
  return <section className={a.panel} aria-label="إحصاءات المنيو والولاء" aria-busy={loading}>
    <h3 className={s.groupHeading}>المنيو وبطاقات الولاء</h3>
    <form className={s.operationsFilters} onSubmit={event => { event.preventDefault(); load(from, to); }}>
      <label>من<input type="date" aria-label="بداية فترة الإحصاءات" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
      <label>إلى<input type="date" aria-label="نهاية فترة الإحصاءات" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
      <button className={s.primaryButton} disabled={loading} type="submit">تطبيق الفترة</button>
      <button className={s.textButton} disabled={loading} type="button" onClick={() => { setFrom(""); setTo(""); load("", ""); }}>كل الفترات</button>
    </form>
    {loading ? <p className={s.operationNotice} role="status">جارٍ تحميل الإحصاءات…</p>
      : error ? <div className={s.operationNotice} role="alert"><p>{error}</p><button type="button" className={s.textButton} onClick={() => load(from, to)}>إعادة المحاولة</button></div>
      : data && <>
        <p className={a.period}>{data.from || data.to ? `${data.from || "البداية"} — ${data.to || "اليوم"}` : "جميع الفترات"} · بتوقيت السعودية</p>
        <h4 className={a.heading}>الوصول إلى المنيو والولاء</h4>
        <dl className={a.grid}>
          <Metric title="زوار المنيو المستقل" value={engagement?.menu_view?.visitors ?? 0} detail={`${number(engagement?.menu_view?.events ?? 0)} زيارة`} />
          <Metric title="ضغطوا الولاء من المنيو" value={engagement?.menu_loyalty_click?.visitors ?? 0} detail={`${number(engagement?.menu_loyalty_click?.events ?? 0)} ضغطة`} />
          <Metric title="زوار الولاء من باركود التسجيل" value={engagement?.loyalty_qr_visit?.visitors ?? 0} detail={`${number(engagement?.loyalty_qr_visit?.events ?? 0)} زيارة عبر رابط الباركود`} />
        </dl>
        <p className={a.note}>وصلوا إلى صفحة الولاء من المنيو: {number(engagement?.loyalty_menu_visit?.visitors ?? 0)} زائر · زيارات الولاء دون مصدر محدد: {number(engagement?.loyalty_direct_visit?.events ?? 0)} زيارة</p>
        <p className={a.note}>بدأ قياس الزيارات في {recordedDate(data.engagementStartedAt)}. الزائر هو متصفح مميز خلال الفترة وليس هوية عميل مؤكدة تغيير الجهاز أو مسح التخزين قد يحسب زائرًا جديدًا تُدمج القراءات المتكررة لنفس المؤشر خلال عشر ثوانٍ</p>
        <p className={a.note}>مصدر الباركود يُعرف من رابط التسجيل المميز الجديد؛ الروابط القديمة أو غير المميزة تظهر دون مصدر محدد</p>
        <h4 className={a.heading}>إصدار بطاقات المحافظ</h4>
        <dl className={a.grid}>
          <Metric title="عملاء صدرت لهم بطاقة" value={data.wallet.customers} detail={`${number(data.wallet.issuances)} عملية إصدار إجمالًا`} />
          <Metric title="بطاقات آيفون" value={data.wallet.appleCustomers} detail={`${number(data.wallet.appleDownloads)} إصدار لملف البطاقة`} />
          <Metric title="بطاقات قوقل" value={data.wallet.googleCustomers} detail={`${number(data.wallet.googleSaveLinks)} رابط حفظ صادر`} />
        </dl>
        <p className={a.note}>العدد الأساسي لبطاقات العملاء المميزة؛ إعادة إصدار البطاقة تظهر في العمليات فقط العميل الذي أصدر بطاقة آيفون وقوقل يُحسب مرة واحدة في الإجمالي إصدار الملف أو رابط الحفظ لا يؤكد إضافة البطاقة إلى الجهاز</p>
        <p className={a.note}>سجل الإصدار متاح منذ {recordedDate(data.walletStartedAt)}؛ لا تُقدّر التنزيلات الأقدم غير المسجلة</p>
        <h4 className={a.heading}>الختم وصرف المكافآت المؤكد</h4>
        <dl className={`${a.grid} ${a.two}`}>
          <Metric title="عمليات الختم المؤكدة" value={data.confirmed.stamp?.operations ?? 0} detail={`${number(data.confirmed.stamp?.customers ?? 0)} عميل حصل على ختم`} />
          <Metric title="عمليات صرف المكافأة المؤكدة" value={data.confirmed.redeem?.operations ?? 0} detail={`${number(data.confirmed.redeem?.customers ?? 0)} عميل صرف مكافأة`} />
        </dl>
        <p className={a.note}>تُحسب العمليات الناجحة فقط؛ فحص الباركود والمحاولات المرفوضة والطلبات المكررة لا تدخل في العدد التسجيل المباشر منذ {recordedDate(data.operationsStartedAt)} مع العمليات القديمة المتوفرة في السجل</p>
      </>}
  </section>;
}
