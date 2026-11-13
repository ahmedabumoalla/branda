"use client";

import Image from "next/image";
import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FinanceShiftDetail } from "@/lib/finance/shift-operations";
import { printThermalReceipt, type ReceiptBrand, type ReceiptPaper } from "./finance-receipt-print";
import { Field, financeDate, Numeric } from "./finance-ui";
import styles from "./finance.module.css";

export function shiftDuration(start: string, end: string | null) {
  if (!end) return "الوردية جارية";
  const minutes = Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 60000));
  return `${Math.floor(minutes / 60)} ساعة و${minutes % 60} دقيقة`;
}

export function FinanceShiftReport({ detail, slug, brandName }: { detail: FinanceShiftDetail; slug: string; brandName: string }) {
  const [brand, setBrand] = useState<ReceiptBrand | null>(null);
  const [paper, setPaper] = useState<ReceiptPaper>("auto");
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const receipt = useRef<HTMLElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/finance/${encodeURIComponent(slug)}/receipt-brand`, { signal: controller.signal, cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("تعذر تحميل هوية العلامة للطباعة"); return response.json() as Promise<ReceiptBrand>; }).then(value => { if (!controller.signal.aborted) setBrand(value); }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل التقرير"); });
    return () => controller.abort();
  }, [slug, retry]);
  const { shift, summary } = detail;
  const rows: [string, number | null][] = [["نقدية البداية المعدودة", shift.opening_cash], ["مبيعات نقدية", summary.cash_sales], ["مبيعات الشبكة", summary.pos_sales], ["تحويلات بنكية", summary.bank_sales], ["مرتجعات نقدية معتمدة", summary.cash_refunds], ["سداد الموردين", summary.supplier_payouts], ["نقدية متوقعة عند الإقفال", shift.expected_cash], ["النقدية المعدودة عند الإقفال", shift.counted_cash], ["فرق النقدية", shift.variance]];
  return <div className={styles.form}>
    <div className={styles.toolbar}><Field label="ورق الطباعة"><select value={paper} onChange={event => setPaper(event.target.value as ReceiptPaper)}><option value="auto">حسب إعداد الطابعة</option><option value="80">حراري ٨٠ مم</option><option value="58">حراري ٥٨ مم</option></select></Field><button type="button" className={styles.primary} disabled={printing || !brand} onClick={async () => { if (busy.current) return; busy.current = true; setPrinting(true); setError(""); try { await printThermalReceipt(receipt.current, paper); } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذرت الطباعة"); } finally { busy.current = false; setPrinting(false); } }}><Printer size={16} aria-hidden="true" />{printing ? "جارٍ تجهيز الطباعة" : "طباعة ملخص الوردية"}</button></div>
    <p className={styles.muted}>ملخص حراري بدون سجل الفواتير اختر مقاس الورق نفسه في إعدادات طابعة نقطة البيع</p>
    {error && <div className={styles.error} role="alert">{error}<button className={styles.secondary} type="button" onClick={() => { setError(""); setBrand(null); setRetry(value => value + 1); }}>إعادة المحاولة</button></div>}
    <div className={styles.shiftReportPreview}><article ref={receipt} data-finance-receipt dir="rtl" className={styles.shiftReportPaper}>
      <header data-receipt-header>{brand?.logoUrl && <Image src={brand.logoUrl} alt="" width={130} height={80} unoptimized />}<h3>{brand?.name ?? brandName}</h3><p data-receipt-title>تقرير الوردية المختصر</p><p>{shift.employee_name}</p></header>
      <div data-receipt-meta><p>البداية {financeDate(shift.opened_at)}</p><p>النهاية {financeDate(shift.closed_at)}</p><p>المدة {shiftDuration(shift.opened_at, shift.closed_at)}</p></div>
      {rows.map(([label, value]) => <div data-receipt-row key={label}><span>{label}</span><strong>{value === null ? "—" : <Numeric value={value} money />}</strong></div>)}
      <div data-receipt-row data-receipt-total><span>عدد فواتير البيع</span><strong>{summary.invoice_count}</strong></div>
      {detail.payouts.length > 0 && <><p data-receipt-title>مستندات الموردين</p>{detail.payouts.map(payout => <div data-receipt-row key={payout.id}><span>{payout.supplier_name}<small> #{payout.number} {payout.payment === "credit" ? "آجل" : "نقدي"}</small></span><strong><Numeric value={payout.payment === "credit" ? payout.amount : payout.paid} money /></strong></div>)}</>}
      {detail.variances.map(variance => <div data-receipt-row key={variance.id}><span>{variance.phase === "opening" ? "فرق البداية" : "فرق الإقفال"} — {variance.status === "pending" ? "بانتظار التسوية" : variance.status === "waive" ? "تسوية دون خصم" : "محمل على الموظف"}</span><Numeric value={variance.difference} money /></div>)}
      <footer data-receipt-footer>برندة المالية</footer>
    </article></div>
  </div>;
}
