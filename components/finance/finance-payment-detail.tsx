"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, ChevronDown, Pencil, Printer, Trash2 } from "lucide-react";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import type { InvoicePayment } from "@/lib/finance/payment-management";
import { paymentReceiptData } from "@/lib/finance/payment-receipt";
import { InvoiceFileDownloads } from "./company-invoice-files";
import { Numeric } from "./finance-ui";
import styles from "./finance-payment-detail.module.css";

function paymentDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "غير مسجل" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.row}><dt>{label}</dt><dd>{children || "غير مسجل"}</dd></div>;
}

export function FinancePaymentDetail({ document, detail, snapshot, disabled, onBack, onInvoice, onEdit, onDelete, onReceipt, onCustomer, onJournal }: {
  document: FinanceDocument; detail: InvoiceDetail; snapshot: FinanceSnapshot; disabled: boolean;
  onBack: () => void; onInvoice: () => void; onEdit?: (payment: InvoicePayment) => void; onDelete?: (payment: InvoicePayment) => void;
  onReceipt: (mode: "standard" | "thermal") => void;
  onCustomer?: (id: string) => void; onJournal?: (id: string) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [document.id]);
  const data = paymentReceiptData(document, detail, snapshot);
  const payment = detail.payments?.find(item => item.id === document.id);
  const printable = data.status !== "pending" && data.status !== "deleted" && data.amount > 0;
  const customer = detail.customer;
  const customerName = customer?.id && onCustomer ? <button type="button" className={styles.link} disabled={disabled} onClick={() => { if (!disabled) onCustomer(customer.id); }}>{data.customer}</button> : data.customer;
  const text = (key: string) => typeof customer?.details?.[key] === "string" ? customer.details[key] as string : "";
  const canEdit = !!onEdit && !!payment?.canEdit && !disabled;
  const canDelete = !!onDelete && !!payment?.canDelete && !disabled;
  const reason = payment?.blockedReason || (!payment ? data.refund ? "هذا إيصال استرداد وليس دفعة قابلة للتعديل" : "أعد تحميل الفاتورة لتحديث صلاحيات الدفعة" : !onEdit ? "لا تملك صلاحية تعديل دفعات الفواتير" : "");
  const menuId = "payment-view-receipts-" + document.id;
  const openReceipt = (mode: "standard" | "thermal") => { if (!disabled && printable) onReceipt(mode); };
  return <section className={styles.page} dir="rtl" aria-label="عرض الدفعة" aria-busy={disabled}>
    <header className={styles.header}>
      <div className={styles.identity}><h2 ref={heading} tabIndex={-1}>{data.refund ? "عملية استرداد" : "عملية الدفع"} <bdi>{document.id === detail.document.id ? data.paymentNumber : "#" + data.paymentNumber}</bdi></h2><p><span>العميل: {customerName}</span>{onJournal && <button type="button" className={styles.link} disabled={disabled} onClick={() => { if (!disabled) onJournal(document.id); }}>قيد <bdi>#{String(document.number).padStart(6, "0")}</bdi></button>}<button type="button" className={styles.link} onClick={onInvoice}>الفاتورة <bdi>#{data.invoiceNumber}</bdi></button></p></div>
      <div className={styles.actions} aria-label="إجراءات الدفعة">
        <button type="button" className={styles.edit} disabled={!canEdit} aria-describedby={reason ? "payment-view-reason" : undefined} onClick={() => { if (canEdit && payment) onEdit?.(payment); }}><Pencil size={15} aria-hidden="true" />تعديل</button>
        <button type="button" disabled={disabled || !printable} popoverTarget={menuId} onClick={event => { const panel = event.currentTarget.nextElementSibling as HTMLElement; const rect = event.currentTarget.getBoundingClientRect(); panel.style.left = Math.max(10, Math.min(window.innerWidth - 230, rect.left)) + "px"; panel.style.top = Math.max(10, Math.min(window.innerHeight - 125, rect.bottom + 5)) + "px"; }}><Printer size={15} aria-hidden="true" />إيصال<ChevronDown size={13} aria-hidden="true" /></button>
        <div id={menuId} popover="auto" className={styles.receiptMenu} role="group" aria-label="خيارات الإيصال"><button type="button" disabled={disabled || !printable} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); openReceipt("standard"); }}><Printer size={15} aria-hidden="true" />إيصال مدفوعات</button><button type="button" disabled={disabled || !printable} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); openReceipt("thermal"); }}><Printer size={15} aria-hidden="true" />إيصال مدفوعات حراري</button></div>
        <button type="button" className={styles.delete} disabled={!canDelete} aria-describedby={reason ? "payment-view-reason" : undefined} onClick={() => { if (canDelete && payment) onDelete?.(payment); }}><Trash2 size={15} aria-hidden="true" />حذف</button>
        <button type="button" onClick={onBack}><ArrowRight size={15} aria-hidden="true" />المدفوعات</button>
      </div>
    </header>
    {reason && <p id="payment-view-reason" className={styles.notice}>{reason}</p>}
    <div className={styles.columns}>
      <section className={styles.panel} aria-labelledby="payment-customer-heading"><h3 id="payment-customer-heading">بيانات العميل</h3><dl className={styles.facts}>
        <Row label="اسم العميل">{customerName}</Row><Row label="المدينة">{text("city")}</Row><Row label="المنطقة">{text("region")}</Row><Row label="الرمز البريدي"><bdi>{text("postalCode") || "غير مسجل"}</bdi></Row><Row label="الهاتف"><bdi>{customer?.phone || detail.invoice?.customer.phone || document.customer_phone || text("telephone") || "غير مسجل"}</bdi></Row><Row label="البلد"><bdi>{text("country") || "غير مسجل"}</bdi></Row><Row label="العملة"><bdi>SAR</bdi></Row><Row label="عنوان الاتصال (IP)">غير مسجل</Row>
      </dl></section>
      <section className={styles.panel} aria-labelledby="payment-data-heading"><h3 id="payment-data-heading">بيانات الدفع</h3><dl className={styles.facts}>
        <Row label="رقم الفاتورة"><button type="button" className={styles.link} onClick={onInvoice}><bdi>{data.invoiceNumber}</bdi></button></Row><Row label="وسيلة دفع">{data.method}</Row><Row label="المبلغ"><Numeric value={data.amount} money /></Row><Row label="رقم معرف للتحويل"><bdi>{data.reference || "غير مسجل"}</bdi></Row><Row label="الحالة"><span className={styles.status} data-state={data.status}>{data.status === "pending" ? "معلق" : data.status === "deleted" ? "محذوف" : data.refund ? "مسترد" : "مكتمل"}</span></Row><Row label="التاريخ"><time dateTime={data.date} dir="ltr">{paymentDate(data.date)}</time></Row><Row label="أضيفت بواسطة">{data.actor}</Row><Row label="حساب التحصيل">{data.account}</Row>
      </dl></section>
    </div>
    {(data.details || data.note || !!data.attachments?.length) && <section className={styles.panel} aria-labelledby="payment-notes-heading"><h3 id="payment-notes-heading">ملاحظات ومرفقات الدفعة</h3><div className={styles.notes}>{data.details && <p><strong>بيانات الدفع</strong>{data.details}</p>}{data.note && <p><strong>ملاحظات إيصال الاستلام</strong>{data.note}</p>}<InvoiceFileDownloads files={data.attachments ?? []} slug={snapshot.cafe.slug} /></div></section>}
  </section>;
}
