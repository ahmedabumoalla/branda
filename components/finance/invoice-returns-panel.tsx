"use client";

import { useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import { SalesReturnPrintDialog } from "./sales-return-print-dialog";
import { financeDate, Numeric } from "./finance-ui";
import styles from "./finance-invoice-detail.module.css";

export function InvoiceReturnsPanel({ detail, snapshot, disabled }: { detail: InvoiceDetail; snapshot: FinanceSnapshot; disabled: boolean }) {
  const [printId, setPrintId] = useState<string | null>(null);
  const returns = detail.related.filter(item => item.kind === "refund" && item.reference_id === detail.document.id);
  const requests = (snapshot.refundRequests ?? []).filter(item => item.document_id === detail.document.id);
  const total = returns.reduce((sum, item) => sum + item.total, 0);
  const paid = returns.reduce((sum, item) => sum + item.paid, 0);
  return <div className={styles.body}>
    <h3><RotateCcw size={18} aria-hidden="true" /> المرتجع</h3>
    <div className={styles.liveBalance}><span>قيمة المرتجعات المعتمدة <Numeric value={total} money /></span><span>تخفيض المديونية <Numeric value={total - paid} money /></span><span>المبلغ المعاد للعميل <Numeric value={paid} money /></span><span>المتبقي على الفاتورة <Numeric value={detail.document.outstanding} money /></span></div>
    {!!returns.length && <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="المرتجعات المعتمدة للفاتورة"><table><thead><tr>{["رقم المرتجع", "التاريخ", "قيمة المرتجع", "تخفيض المديونية", "المبلغ المعاد", "حساب التسوية", "المستند"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{returns.map(item => <tr key={item.id}><td><strong>#{item.number}</strong>{item.note && <p>{item.note}</p>}</td><td>{financeDate(item.created_at)}</td><td><Numeric value={item.total} money /></td><td><Numeric value={item.total - item.paid} money /></td><td><Numeric value={item.paid} money /></td><td>{item.paid > 0 ? snapshot.accounts.find(account => account.id === item.account_id)?.name || "الحساب المسجل" : "تخفيض مديونية فقط"}</td><td><button type="button" disabled={disabled} onClick={() => setPrintId(item.id)}><Printer size={16} aria-hidden="true" />طباعة المرتجع</button></td></tr>)}</tbody></table></div>}
    {!returns.length && <p className={styles.hint}>{requests.some(item => item.status === "pending") ? "طلب المرتجع بانتظار الاعتماد ولم تُخصم قيمته من الرصيد بعد" : "لا توجد مرتجعات معتمدة لهذه الفاتورة"}</p>}
    {printId && <SalesReturnPrintDialog key={snapshot.cafe.slug + printId} id={printId} slug={snapshot.cafe.slug} onClose={() => setPrintId(null)} />}
  </div>;
}
