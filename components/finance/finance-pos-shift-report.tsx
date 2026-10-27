"use client";
import { useEffect, useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Modal } from "@/components/dashboard/ui/modal";
import { fetchPosShiftReportAction } from "@/app/actions/finance-pos-shift-report";
import type { PosShiftReport } from "@/lib/finance/pos-shift-report";
import { printThermalReceipt } from "./finance-receipt-print";
import { financeDate, Numeric } from "./finance-ui";
import styles from "./finance.module.css";

export function FinancePosShiftReport({ shiftId, slug, onClose }: { shiftId: string; slug?: string; onClose: () => void }) {
  const [report, setReport] = useState<PosShiftReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState("");
  const receipt = useRef<HTMLElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetchPosShiftReportAction(shiftId, slug).then(result => { if (!cancelled) { if (result.ok) setReport(result.data); else setError(result.message); } }).catch(() => { if (!cancelled) setError("تعذر الاتصال لتحميل التقرير أعد المحاولة"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shiftId, slug, retry]);
  const shift = report?.shift;
  const duration = shift ? Math.max(0, Math.floor((Date.parse(shift.closed_at ?? shift.opened_at) - Date.parse(shift.opened_at)) / 60000)) : 0;
  const rows: [string, number | null][] = report ? [["عدد فواتير البيع", report.invoiceCount], ["إجمالي المبيعات شامل الضريبة", report.salesTotal], ["مرتجعات فواتير الوردية", report.refundsTotal], ["صافي المبيعات", report.netSales], ["إجمالي المدفوع للموردين من الصندوق", report.supplierPayoutTotal ?? 0], ["منها فواتير مشتريات نقدية", report.purchaseTotal ?? 0], ["نقدية بداية الوردية", report.shift.opening_cash], ["النقدية المتوقعة عند الإقفال", report.shift.expected_cash], ["النقدية المعدودة عند الإقفال", report.shift.counted_cash], ["فرق الإقفال", report.shift.variance]] : [];
  return <Modal open title={`تقرير آخر وردية${shift?.shift_number ? ` #${shift.shift_number}` : ""}`} onClose={onClose} panelClassName="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
    <div className={styles.form}>
      {loading && <p role="status">جارٍ تحميل تقرير الوردية</p>}
      {error && <div className={styles.error} role="alert">{error}<button type="button" className={styles.secondary} onClick={() => { setLoading(true); setError(""); setReport(null); setRetry(value => value + 1); }}>إعادة المحاولة</button></div>}
      {report && <><button className={styles.primary} type="button" disabled={printing} onClick={async () => { if (busy.current) return; busy.current = true; setPrinting(true); setError(""); try { await printThermalReceipt(receipt.current, "80"); setStatus("فُتحت الطباعة يمكنك اختيار الطابعة أو الحفظ بصيغة PDF"); } catch { setError("تعذّر فتح الطباعة أعد المحاولة"); } finally { busy.current = false; setPrinting(false); } }}><Printer size={18} aria-hidden="true" />{printing ? "جارٍ تجهيز التقرير" : "طباعة أو حفظ التقرير"}</button>
        {status && <p role="status">{status}</p>}
        <article ref={receipt} data-finance-receipt dir="rtl" className={styles.panel} style={{ padding: 20 }}>
          <header data-receipt-header><h3>{report.brandName}</h3><p data-receipt-title>تقرير الوردية #{shift?.shift_number ?? ""}</p><p>{report.accountName}</p></header>
          <div data-receipt-meta><p>البداية {financeDate(report.shift.opened_at)}</p><p>الإقفال {financeDate(report.shift.closed_at)}</p><p>المدة {Math.floor(duration / 1440)} يوم و{Math.floor(duration % 1440 / 60)} ساعة و{duration % 60} دقيقة</p></div>
          {rows.map(([label, value], index) => <div key={label} data-receipt-row className={styles.balanceLine}><span>{label}</span><strong>{value === null ? "—" : <Numeric value={value} money={index !== 0} />}</strong></div>)}
          <p data-receipt-title>تحصيل فواتير الوردية</p>
          {report.payments.map(payment => <div key={payment.kind} data-receipt-row className={styles.balanceLine}><span>{payment.kind === "cash" ? "نقدي" : payment.kind === "pos" ? "شبكة" : payment.kind === "bank" ? "تحويل بنكي" : "تحصيل آخر"}</span><strong><Numeric value={payment.collected - payment.refunded} money /></strong></div>)}
          {!!report.supplierPayouts?.length && <section aria-label="سداد الموردين"><p data-receipt-title>سندات سداد الموردين</p>{report.supplierPayouts.map(payout => <div key={payout.id} className="border-t py-3"><div data-receipt-row><strong>#{payout.number} {payout.supplierName}</strong><Numeric value={payout.amount} money /></div><p>{financeDate(payout.createdAt)}</p>{payout.note && <p>{payout.note}</p>}{payout.attachments.map(file => <p key={file.id}><a download href={`/api/finance/${encodeURIComponent(slug ?? "")}/shift-attachments/${file.id}`}>{file.name}</a></p>)}</div>)}</section>}
          <footer data-receipt-footer><p>المبيعات والتحصيل بعد المرتجعات والتسويات المسجلة حتى استخراج التقرير</p><p>أرقام الإقفال ثابتة كما سُجلت عند إقفال الوردية</p><p>{financeDate(report.generatedAt)}</p></footer>
        </article>
      </>}
    </div>
  </Modal>;
}
