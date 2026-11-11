"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import type { PaymentReceiptData, PaymentReceiptMode } from "@/lib/finance/payment-receipt";
import { createPaymentReceiptPdf } from "@/lib/export/payment-receipt-pdf";
import { financeDate, Numeric } from "./finance-ui";
import { InvoiceFileDownloads } from "./company-invoice-files";
import styles from "./finance-invoice-detail.module.css";

export function PaymentReceiptDialog({ data, initialMode, onClose }: { data: PaymentReceiptData; initialMode: PaymentReceiptMode; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [retry, setRetry] = useState(0);
  const printable = data.status !== "pending" && data.status !== "deleted" && data.amount > 0;
  const [result, setResult] = useState<{ data: PaymentReceiptData; mode: PaymentReceiptMode; retry: number; url?: string; error?: string } | null>(null);
  useEffect(() => {
    if (mode === "view" || !printable) return;
    let active = true, url = "";
    createPaymentReceiptPdf(data, mode === "thermal").then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob); setResult({ data, mode, retry, url });
    }).catch(() => { if (active) setResult({ data, mode, retry, error: "تعذر تجهيز إيصال المدفوعات أعد المحاولة" }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [data, mode, retry, printable]);
  const ready = result?.data === data && result.mode === mode && result.retry === retry ? result : null;
  return <Modal open title={mode === "view" ? "عرض الدفعة" : mode === "thermal" ? "إيصال مدفوعات حراري" : "إيصال مدفوعات"} onClose={onClose} panelClassName="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
    <div className={styles.page}><div className={styles.toolbar}><button type="button" onClick={() => setMode("view")} aria-pressed={mode === "view"}>عرض</button><button type="button" disabled={!printable} onClick={() => setMode("standard")} aria-pressed={mode === "standard"}>إيصال مدفوعات</button><button type="button" disabled={!printable} onClick={() => setMode("thermal")} aria-pressed={mode === "thermal"}>إيصال مدفوعات حراري</button></div>
      {mode === "view" || !printable ? <dl className={styles.facts}><dt>حالة الدفع</dt><dd>{data.status === "pending" ? "معلق" : data.status === "deleted" ? "محذوف" : "مكتمل"}</dd><dt>عملية الدفع</dt><dd>{data.paymentNumber}</dd><dt>الفاتورة</dt><dd><bdi>#{data.invoiceNumber}</bdi></dd><dt>العميل</dt><dd>{data.customer}</dd><dt>تاريخ الدفع</dt><dd>{financeDate(data.date)}</dd><dt>الطريقة</dt><dd>{data.method}</dd><dt>الحساب</dt><dd>{data.account}</dd><dt>بواسطة</dt><dd>{data.actor}</dd><dt>{data.refund ? "المبلغ المسترد" : data.status === "pending" ? "مبلغ الدفعة المعلقة" : "المبلغ المدفوع"}</dt><dd><Numeric value={data.amount} money /></dd>{data.reference && <><dt>رقم معرف</dt><dd>{data.reference}</dd></>}{data.details && <><dt>بيانات الدفع</dt><dd className={styles.note}>{data.details}</dd></>}{data.note && <><dt>ملاحظات</dt><dd className={styles.note}>{data.note}</dd></>}</dl> : !ready ? <p role="status">جار تجهيز إيصال المدفوعات</p> : ready.error ? <div role="alert"><p>{ready.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</button></div> : <><div className={styles.toolbar}><a href={ready.url} target="_blank" rel="noreferrer">فتح الإيصال للطباعة</a><a href={ready.url} download={"payment-" + data.id + (mode === "thermal" ? "-80mm" : "-a4") + ".pdf"}>تنزيل الإيصال</a></div><iframe title={mode === "thermal" ? "معاينة إيصال مدفوعات حراري" : "معاينة إيصال مدفوعات"} src={ready.url} className={styles.paymentReceiptPreview} /></>}
      {data.brandSlug && <InvoiceFileDownloads files={data.attachments ?? []} slug={data.brandSlug} />}
    </div>
  </Modal>;
}
