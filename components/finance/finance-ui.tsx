import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import type { FinanceAccountKind, FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import { financeMoney } from "@/lib/finance/brand-finance";
import styles from "./finance.module.css";

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
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className={styles.empty}><Inbox size={30} strokeWidth={1.4} aria-hidden="true" /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className={styles.panel}><div className={styles.panelHeader}><h2 className={styles.panelTitle}>{title}</h2>{action}</div>{children}</section>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return <div className={styles.metric}><div className={styles.metricLabel}>{label}</div><div className={styles.metricValue}><Numeric value={value} /><small>ر س</small></div>{note && <div className={styles.metricNote}>{note}</div>}</div>;
}
export function FinanceReceipt({ document, snapshot }: { document: FinanceDocument; snapshot: FinanceSnapshot }) {
  const customer = snapshot.parties.find((party) => party.id === document.party_id);
  const account = snapshot.accounts.find((item) => item.id === document.account_id);
  return <article className={styles.receipt}>
    <header className={styles.receiptHeader}><h3>{snapshot.cafe.name}</h3><p>{documentKindNames[document.kind] ?? "مستند مالي"} #{document.number}</p><p>{financeDate(document.created_at)}</p>{customer && <p>{customer.name}</p>}</header>
    {document.lines.map((line) => <div className={styles.balanceLine} key={line.id}><span>{line.name}<br /><small>{line.quantity} × {financeMoney(line.unit_price)}</small></span><strong><Numeric value={line.net + line.tax} money /></strong></div>)}
    <div className={styles.balanceLine}><span>المجموع قبل الخصم</span><Numeric value={document.subtotal} money /></div>
    <div className={styles.balanceLine}><span>الخصم</span><Numeric value={document.discount} money /></div>
    <div className={styles.balanceLine}><span>ضريبة القيمة المضافة</span><Numeric value={document.tax} money /></div>
    <div className={`${styles.balanceLine} ${styles.total}`}><span>الإجمالي</span><Numeric value={document.total} money /></div>
    {!document.refunded && <div className={styles.balanceLine}><span>المدفوع {account ? `· ${account.name}` : ""}</span><Numeric value={document.total - document.outstanding} money /></div>}
    {document.outstanding > .009 && <div className={styles.balanceLine}><span>المتبقي</span><Numeric value={document.outstanding} money /></div>}
    {document.refunded && <p className={styles.notice}>تم إرجاع هذا المستند</p>}
    {document.note && <p className={styles.muted}>{document.note}</p>}
    <p className={styles.muted}>إيصال عملية داخلي</p>
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

export function printFinanceReceipt(element: HTMLElement | null) {
  if (!element) return;
  const frame = document.createElement("iframe");
  frame.title = "طباعة الإيصال"; frame.style.cssText = "position:fixed;width:1px;height:1px;bottom:0;opacity:0;pointer-events:none";
  frame.onload = () => {
    const target = frame.contentWindow;
    if (!target) { frame.remove(); return; }
    target.onafterprint = () => frame.remove();
    target.focus(); target.print();
    setTimeout(() => frame.remove(), 60000);
  };
  // outerHTML comes from React-rendered text nodes, never from user-provided markup.
  frame.srcdoc = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال العملية</title><style>body{font:14px sans-serif;color:#111;margin:18px}article{max-width:80mm;margin:auto}header{text-align:center;border-bottom:1px dashed #999;padding-bottom:12px}article>div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px dashed #ddd}small,p{font-size:12px}@page{margin:8mm}</style></head><body>${element.outerHTML}</body></html>`;
  document.body.appendChild(frame);
}
