"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, RefreshCw, Search, Star } from "lucide-react";
import { fetchAdminPagerPageAction } from "@/app/actions/pager";
import type { PagerFilter, PagerPage } from "@/lib/pager/types";
import { PagerOrderCard } from "./pager-order-card";
import { pagerDuration } from "./pager-format";
import styles from "./pager.module.css";

export function PagerBrandPanel({ cafeId }: { cafeId: string }) {
  const [data, setData] = useState<PagerPage | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PagerFilter["status"]>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [query]);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError("");
    try { const next = await fetchAdminPagerPageAction(cafeId, { page, query: search, status }); if (request === sequence.current) setData(next); }
    catch { if (request === sequence.current) setError("تعذر تحميل سجل البيجر حاول تحديث البيانات"); }
    finally { if (request === sequence.current) setLoading(false); }
  }, [cafeId, page, search, status]);
  useEffect(() => { setData(null); void load(); return () => { sequence.current++; }; }, [load]);

  return <section dir="rtl" className={`${styles.root} ${styles.dark}`}>
    <header className={styles.header}><div><p className={styles.eyebrow}>من إضافة الفاتورة حتى رأي العميل</p><h2 className={styles.title}>نظام البيجر</h2><p className={styles.muted}>سجل الاستدعاء وأوقات التجهيز والاستلام والتقييمات</p></div><button className={styles.secondary} type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={17} aria-hidden="true" />تحديث</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {data && <>
      <div className={styles.metrics}>
        <div className={styles.metric}><span>إجمالي الفواتير المرتبطة</span><strong>{data.metrics.total}</strong></div>
        <div className={styles.metric}><span>متوسط وقت التجهيز</span><strong>{pagerDuration(data.metrics.averagePreparationSeconds)}</strong></div>
        <div className={styles.metric}><span>متوسط الانتظار بعد النداء</span><strong>{pagerDuration(data.metrics.averageCollectionSeconds)}</strong></div>
        <div className={styles.metric}><span>تقييم الخدمة</span><strong>{data.metrics.averageRating == null ? "—" : `${data.metrics.averageRating.toFixed(1)} / 5`}</strong><span>{data.metrics.ratedCount} تقييم</span></div>
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap", marginBottom: 20 }}><span className={styles.badge}>قيد التجهيز {data.metrics.waiting}</span><span className={styles.badge} data-status="ready">بانتظار الاستلام {data.metrics.ready}</span><span className={styles.badge} data-status="received">تم الاستلام {data.metrics.received}</span><span className={styles.badge}>ملغي {data.metrics.cancelled}</span></div>
    </>}
    <div className={styles.toolbar}>
      <label className={styles.search}><span className="sr-only">البحث برقم الفاتورة أو الجوال</span><input className={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="رقم الفاتورة أو الجوال" maxLength={120} /><Search size={18} aria-hidden="true" /></label>
      <label className={styles.label}>حالة الطلب<select className={styles.select} value={status} onChange={(e) => { setStatus(e.target.value as PagerFilter["status"]); setPage(0); }}><option value="all">جميع الطلبات</option><option value="waiting">قيد التجهيز</option><option value="ready">بانتظار الاستلام</option><option value="received">تم الاستلام</option><option value="cancelled">ملغي</option></select></label>
    </div>
    <div aria-busy={loading}>
      {data?.orders.length ? <div className={styles.queue}>{data.orders.map((order) => <PagerOrderCard key={order.id} order={order} />)}</div>
        : <div className={styles.empty}><BellRing size={32} aria-hidden="true" /><h3>{loading ? "جار تحميل سجل الاستدعاء" : error ? "البيانات غير متاحة الآن" : "لا توجد فواتير في هذا العرض"}</h3><p className={styles.muted}>تظهر الفواتير وأرقام الجوال والأوقات هنا فور إضافة الطلبات</p></div>}
    </div>
    {data && data.total > data.pageSize && <nav className={styles.pagination} aria-label="صفحات سجل البيجر"><button className={styles.secondary} disabled={page === 0 || loading} onClick={() => setPage((v) => v - 1)}><ChevronRight size={16} aria-hidden="true" />السابق</button><span>{page + 1} من {Math.ceil(data.total / data.pageSize)}</span><button className={styles.secondary} disabled={(page + 1) * data.pageSize >= data.total || loading} onClick={() => setPage((v) => v + 1)}>التالي<ChevronLeft size={16} aria-hidden="true" /></button></nav>}
    <p className={styles.hint}><Star size={13} className="inline" aria-hidden="true" /> التقييم والملاحظات داخل تفاصيل كل فاتورة والتوقيت حسب السعودية</p>
  </section>;
}
