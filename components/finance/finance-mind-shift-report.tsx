"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Printer } from "lucide-react";

import type { PosShiftReport } from "@/lib/finance/pos-shift-report";
import { claimAutomaticReceiptPrint } from "./finance-receipt-print";
import { FinancePosModal, useFinancePosLocale } from "./finance-pos-locale";
import { useFinancePrinter } from "./use-finance-printer";
import styles from "./finance.module.css";

const methodLabels = {
  cash: ["كاش", "Cash"], receivable: ["آجل", "On account"], pos: ["شبكة", "Card"],
  bank: ["تحويل بنكي", "Bank transfer"], partial: ["دفع جزئي", "Partially paid"], other: ["أخرى", "Other"],
} as const;

type Props = { shiftId: string; initialReport?: PosShiftReport; pendingReceipts?: number; brandId: string; slug?: string; autoPrint?: boolean; onClose: () => void };

export function FinanceMindShiftReport({ shiftId, brandId, slug, autoPrint, initialReport, pendingReceipts = 0, onClose }: Props) {
  const { t, date, money, number, dir, language } = useFinancePosLocale();
  const [report, setReport] = useState<PosShiftReport | null>(initialReport ?? null);
  const initialPending = useRef(pendingReceipts);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const [status, setStatus] = useState("");
  const receipt = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const printer = useFinancePrinter(brandId);
  useEffect(() => {
    if (initialReport && retry === 0 && initialPending.current === pendingReceipts) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/finance/${encodeURIComponent(slug ?? "")}/shift-report?shift=${encodeURIComponent(shiftId)}`, {
          cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || result.shift?.id !== shiftId) throw new Error(result.message);
        if (!controller.signal.aborted) { setReport(result); setLoadError(""); }
      } catch {
        if (!controller.signal.aborted) setLoadError(t("تعذر الاتصال لتحميل التقرير", "Could not load the shift report"));
      }
    }
    void load();
    return () => controller.abort();
  }, [shiftId, slug, retry, t, initialReport, pendingReceipts]);

  const printKey = `shift:${shiftId}`;
  async function print(automatic: boolean) {
    if (busy.current || !receipt.current || !printer.ready) return;
    busy.current = true;
    setPrinting(true);
    setPrintError("");
    setStatus("");
    try {
      const result = await printer.handler(printKey, automatic)(receipt.current, "auto", { newCopy: !automatic });
      setStatus(result.submittedToDevice
        ? t("أُرسل التقرير إلى الطابعة الحرارية", "Report sent to the thermal printer")
        : t("فُتحت نافذة طباعة التقرير", "Report print dialog opened"));
    } catch (error) {
      setPrintError(language === "ar" && error instanceof Error ? error.message : t("تعذرت الطباعة تحقق من الطابعة ثم أعد طباعة التقرير", "Printing failed Check the printer before requesting another copy"));
    } finally {
      busy.current = false;
      setPrinting(false);
    }
  }
  const printOnClose = useEffectEvent(() => {
    if (claimAutomaticReceiptPrint(brandId, printKey)) void print(true);
  });
  useEffect(() => {
    if (autoPrint && report?.shift.id === shiftId && printer.ready) printOnClose();
  }, [autoPrint, report?.shift.id, shiftId, printer.ready]);

  const summary = report?.invoicesAtClose;
  const minutes = report?.shift.closed_at
    ? Math.max(0, Math.floor((Date.parse(report.shift.closed_at) - Date.parse(report.shift.opened_at)) / 60_000))
    : null;
  const methods = (Object.keys(methodLabels) as (keyof typeof methodLabels)[]).map(kind => ({
    kind, count: 0, total: 0, ...summary?.find(row => row.kind === kind),
  })).filter(row => row.count > 0 || ["cash", "receivable", "pos"].includes(row.kind));
  function methodName(kind: string) {
    const [ar, en] = methodLabels[kind as keyof typeof methodLabels] ?? methodLabels.other;
    return t(ar, en);
  }
  const rows: [string, number | null][] = report ? [
    [t("إجمالي المبيعات شامل الضريبة", "Gross sales including tax"), report.salesTotal],
    [t("صافي المبيعات بعد المرتجعات", "Net sales after refunds"), report.netSales],
    [t("مرتجعات فواتير الوردية", "Refunds on shift invoices"), report.refundsTotal],
    [t("إجمالي المدفوع للموردين", "Supplier payouts"), report.supplierPayoutTotal ?? 0],
    [t("منها فواتير مشتريات نقدية", "Of which cash purchases"), report.purchaseTotal ?? 0],
    [t("نقدية بداية الوردية", "Opening cash"), report.shift.opening_cash],
    [t("النقدية المتوقعة عند الإقفال", "Expected closing cash"), report.shift.expected_cash],
    [t("النقدية المعدودة عند الإقفال", "Counted closing cash"), report.shift.counted_cash],
    [t("فرق الإقفال", "Closing difference"), report.shift.variance],
  ] : [];
  const title = t("تقرير إغلاق الوردية", "Shift closing report");
  return <FinancePosModal open title={title} onClose={onClose} panelClassName="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
    <div className={styles.form}>
      {!report && !loadError && <p role="status">{t("جارٍ تحميل تقرير الوردية", "Loading shift report")}</p>}
      {loadError && <div className={styles.error} role="alert">{language === "ar" ? loadError : t("تعذر تحميل التقرير", "Could not load the shift report")}
        <button type="button" className={styles.secondary} onClick={() => { setLoadError(""); setRetry(value => value + 1); }}>{t("إعادة المحاولة", "Retry")}</button></div>}
      {report?.shift.id === shiftId && <>
        <button className={styles.primary} type="button" disabled={!printer.ready || printing} onClick={() => void print(false)}>
          <Printer size={18} aria-hidden="true" />{printing ? t("جارٍ تجهيز التقرير", "Preparing report") : t("طباعة نسخة من التقرير", "Print a copy of the report")}
        </button>
        {printError && <p className={styles.error} role="alert">{printError}</p>}
        {status && <p role="status">{status}</p>}
        <article ref={receipt} data-finance-receipt dir={dir} lang={language} className={styles.shiftReportPaper}>
          <header data-receipt-header><h3>{report.brandName}</h3><p data-receipt-title>{title} #{report.shift.shift_number}</p><p>{report.accountName}</p></header>
          <div data-receipt-meta><p>{t("البداية", "Opened")} {date(report.shift.opened_at)}</p><p>{t("الإقفال", "Closed")} {date(report.shift.closed_at)}</p>{minutes !== null && <p>{t("المدة", "Duration")} {number(Math.floor(minutes / 60))} {t("ساعة", "h")} {number(minutes % 60)} {t("دقيقة", "min")}</p>}</div>
          {summary ? <>
            <p data-receipt-title>{t("فواتير مبيعات الوردية", "Shift sales invoices")}</p>
            <table data-receipt-items>
              <thead><tr><th>{t("طريقة الدفع", "Payment method")}</th><th>{t("العدد", "Count")}</th><th>{t("قيمة الفواتير", "Invoice value")}</th></tr></thead>
              <tbody>{methods.map(row => <tr key={row.kind}><td>{methodName(row.kind)}</td><td>{number(row.count)}</td><td>{money(row.total)}</td></tr>)}</tbody>
              <tfoot><tr><th>{t("الإجمالي", "Total")}</th><td>{number(methods.reduce((sum, row) => sum + row.count, 0))}</td><td>{money(methods.reduce((sum, row) => sum + row.total, 0))}</td></tr></tfoot>
            </table>
            {pendingReceipts > 0 && <p>{t("فواتير هذه الوردية بانتظار المزامنة على الجهاز", "Shift invoices awaiting sync on this device")} {number(pendingReceipts)}</p>}
          </> : <div data-receipt-row><span>{t("عدد فواتير البيع", "Sales invoices")}</span><strong>{number(report.invoiceCount)}</strong></div>}
          <p data-receipt-title>{t("تفاصيل الوردية حتى استخراج التقرير", "Shift details as of report time")}</p>
          {rows.map(([label, value]) => <div key={label} data-receipt-row><span>{label}</span><strong>{value == null ? "—" : money(value)}</strong></div>)}
          <p data-receipt-title>{t("التحصيل بعد التسويات والمرتجعات", "Collections after settlements and refunds")}</p>
          {report.payments.map(payment => <div key={payment.kind} data-receipt-row><span>{methodName(payment.kind)}</span><strong>{money(payment.collected - payment.refunded)}</strong></div>)}
          {!!report.supplierPayouts?.length && <section><p data-receipt-title>{t("سندات سداد الموردين", "Supplier payments")}</p>{report.supplierPayouts.map(payout => <div key={payout.id}><div data-receipt-row><strong>#{payout.number} {payout.supplierName}</strong><span>{money(payout.amount)}</span></div><p>{date(payout.createdAt)}</p>{payout.note && <p>{payout.note}</p>}{payout.attachments.map(file => <p key={file.id}><a download href={`/api/finance/${encodeURIComponent(slug ?? "")}/shift-attachments/${file.id}`}>{file.name}</a></p>)}</div>)}</section>}
          <footer data-receipt-footer>{date(report.generatedAt)}</footer>
        </article>
      </>}
    </div>
  </FinancePosModal>;
}
