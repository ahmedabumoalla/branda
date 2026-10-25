import { Inbox } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { FinanceAccountKind, FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { financeMoney } from "@/lib/finance/brand-finance";
import styles from "./finance.module.css";
import receiptStyles from "./finance-receipt.module.css";
import type { ReceiptBrand, ReceiptCopy } from "./finance-receipt-print";
export { printThermalReceipt as printFinanceReceipt } from "./finance-receipt-print";

export const accountKindNames: Record<FinanceAccountKind, string> = {
  cash: "نقدية", bank: "بنك", pos: "نقاط بيع", employee: "عهد موظفين", receivable: "ذمم العملاء",
  payable: "ذمم الموردين", inventory: "مخزون", revenue: "إيرادات", expense: "مصروفات", equity: "حقوق الملكية",
  vat_input: "ضريبة مدخلات", vat_output: "ضريبة مخرجات",
};
export const documentKindNames: Record<string, string> = {
  sale: "مبيعات", purchase: "مشتريات", refund: "مرتجع", receipt: "سند قبض", expense: "سند صرف",
  transfer: "تحويل داخلي", opening: "رصيد افتتاحي", settlement: "تسوية ذمة", journal: "قيد يومية",
  shift_variance: "فرق جرد وردية", stock_adjust: "تسوية مخزون", stock_transfer: "تحويل مخزون",
};
export function financeDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date);
}
export function Numeric({ value, money = false }: { value: number; money?: boolean }) {
  return <span className={styles.numeric}>{money ? financeMoney(value) : new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 3 }).format(value)}</span>;
}
export function financeDocumentStatus(document: FinanceDocument) {
  if (document.sync_status === "queued") return "محفوظة على الجهاز";
  if (document.sync_status === "conflict") return "تحتاج مراجعة المزامنة";
  if (document.refunded) return "مرتجع كامل";
  if ((document.refunded_total ?? 0) > 0) return "مرتجع جزئي";
  return document.outstanding > .009 ? "مستحق" : "مدفوع";
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.empty}><Inbox size={30} strokeWidth={1.4} aria-hidden="true" /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHeader}><h2 className={styles.panelTitle}>{title}</h2>{action}</div>{children}</section>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Metric({ label, value, note, percent = false }: { label: string; value: number; note?: string; percent?: boolean }) {
  return <div className={styles.metric}><div className={styles.metricLabel}>{label}</div><div className={styles.metricValue}><Numeric value={value} /><small>{percent ? "%" : "ر س"}</small></div>{note && <div className={styles.metricNote}>{note}</div>}</div>;
}
export function FinanceReceipt({ document, snapshot, brand, copy = "customer", preview = false }: { document: FinanceDocument; snapshot: FinanceSnapshot; brand?: ReceiptBrand; copy?: ReceiptCopy; preview?: boolean }) {
  const customer = snapshot.parties.find((party) => party.id === document.party_id);
  const account = snapshot.accounts.find((item) => item.id === document.account_id);
  const preparation = copy === "preparation" && document.kind === "sale";
  const refund = document.kind === "refund";
  const original = snapshot.documents.find((item) => item.id === document.reference_id);
  const returned = document.refunded_total ?? (document.refunded ? document.total : 0);
  const title = preparation ? "طلب تحضير" : refund ? "فاتورة مرتجع" : document.kind === "sale" ? "فاتورة مبيعات" : documentKindNames[document.kind] ?? "مستند مالي";
  return <article dir="rtl" data-finance-receipt data-receipt-preparation={preparation || undefined} className={receiptStyles.receipt} style={{ "--receipt-brand": brand?.color ?? "#3a2117" } as CSSProperties}>
    <header data-receipt-header>
      {/* The original tenant logo must retain its proportions and authenticated signed URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {brand?.logoUrl && <img src={brand.logoUrl} alt={brand.name} />}
      <h3>{brand?.name || snapshot.cafe.name}</h3>
      <p data-receipt-title>{title}</p>{preview ? <p><strong>معاينة فقط لم تُسجل الفاتورة</strong></p> : <><p>{document.number ? `#${document.number}` : document.local_reference}</p>{document.local_reference && document.number > 0 && <p>المرجع المحلي {document.local_reference}</p>}{document.sync_status && document.sync_status !== "synced" && <p>محفوظة على الجهاز بانتظار المزامنة</p>}</>}
      <p>{financeDate(document.created_at)}</p>
    </header>
    <div data-receipt-meta>
      {preparation ? <p>نسخة المطبخ أو البار</p> : <>
        {customer && <p>العميل: {customer.name}</p>}
        {document.customer_phone && <p>رقم العميل: <bdi dir="ltr">{document.customer_phone}</bdi></p>}
        {customer?.tax_number && <p>رقم العميل الضريبي: {customer.tax_number}</p>}
        {account && <p>{refund ? "طريقة إعادة المبلغ" : "طريقة التحصيل"}: {account.kind === "cash" ? "نقدي" : account.kind === "pos" ? "نقاط البيع" : account.kind === "bank" ? "تحويل بنكي" : account.name}</p>}
        <p>جميع المبالغ بالريال السعودي</p>
      </>}
      {refund && <p>مرجع الفاتورة: {original || document.reference_number ? `#${original?.number ?? document.reference_number}` : document.reference_id}</p>}
    </div>
    <table data-receipt-items><thead><tr><th scope="col">الصنف</th><th scope="col">الكمية</th>{!preparation && <th scope="col">الإجمالي</th>}</tr></thead><tbody>
      {document.lines.map((line) => <tr key={line.id}><td>{line.name}{!preparation && <small>سعر الوحدة <Numeric value={line.unit_price} money /></small>}</td><td><Numeric value={line.quantity} /></td>{!preparation && <td><Numeric value={line.net + line.tax} money /></td>}</tr>)}
    </tbody></table>
    {!preparation && <>
      <div data-receipt-row><span>المجموع قبل الخصم</span><Numeric value={document.subtotal} money /></div>
      {document.discount > 0 && <div data-receipt-row><span>الخصم</span><Numeric value={document.discount} money /></div>}
      <div data-receipt-row><span>القيمة قبل الضريبة</span><Numeric value={document.total - document.tax} money /></div>
      <div data-receipt-row><span>ضريبة القيمة المضافة{document.vat_rate != null ? ` ${document.vat_rate}%` : ""}</span><Numeric value={document.tax} money /></div>
      {document.tax_inclusive != null && <p>{document.tax_inclusive ? "الأسعار شاملة الضريبة" : "الأسعار غير شاملة الضريبة"}</p>}
      <div data-receipt-row data-receipt-total><span>{refund ? "إجمالي المرتجع" : "الإجمالي"}</span><Numeric value={document.total} money /></div>
      {refund ? <>
        <div data-receipt-row><span>المبلغ المعاد للعميل</span><Numeric value={document.paid} money /></div>
        {document.total - document.paid > .009 && <div data-receipt-row><span>تخفيض الرصيد الآجل</span><Numeric value={document.total - document.paid} money /></div>}
      </> : <>
        {returned > .009 && <div data-receipt-row><span>{document.refunded ? "مرتجع كامل" : "مرتجع جزئي"}</span><Numeric value={returned} money /></div>}
        <div data-receipt-row><span>{preview ? "المبلغ المتوقع تحصيله" : returned > .009 ? "صافي المدفوع بعد المرتجع" : "المدفوع"}</span><Numeric value={Math.max(0, document.total - returned - document.outstanding)} money /></div>
        {document.outstanding > .009 && <div data-receipt-row><span>المتبقي</span><Numeric value={document.outstanding} money /></div>}
      </>}
    </>}
    {document.note && <p data-receipt-note>{preparation ? "ملاحظة الطلب" : "ملاحظة"}: {document.note}</p>}
    <footer data-receipt-footer>{preview ? "معاينة فقط وليست إثبات دفع" : preparation ? "نسخة تحضير وليست فاتورة تحصيل" : "شكرًا لزيارتكم"}</footer>
  </article>;
}

/** Prevent spreadsheet formulas when exporting customer-entered names. */
export function financeCsv(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((row) => row.map((cell) => {
    const value = String(cell);
    const safe = /^[\s]*[=+@\-\t\r]/.test(value) && typeof cell !== "number" ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n");
}
export function downloadFinanceCsv(name: string, rows: (string | number)[][]) {
  const url = URL.createObjectURL(new Blob([financeCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
