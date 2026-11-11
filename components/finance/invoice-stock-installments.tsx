import { CreditCard, MoreHorizontal, UserRound } from "lucide-react";
import type { FinanceDocument } from "@/lib/finance/brand-finance";
import { invoiceInstallmentBalances, type InvoiceDetail, type InvoiceSchedule } from "@/lib/finance/invoice-management";
import { financeDate, Numeric } from "./finance-ui";
import styles from "./finance-invoice-detail.module.css";

export function renderInvoiceStock(detail: InvoiceDetail, confirmed: boolean) {
  return <div className={styles.stockBody}>{detail.movements.length ? <div className={styles.tableWrap} role="region" tabIndex={0} aria-label="حركات مخزون الفاتورة"><table className={styles.invoiceStockTable}><thead><tr><th>اسم المنتج</th><th>الكمية</th><th>رصيد المخزون</th></tr></thead><tbody>{detail.movements.map(item => <tr key={item.id}>
    <td><strong>{item.name} {item.sku && <bdi>(#{item.sku})</bdi>}</strong><small>{financeDate(item.created_at)} <bdi>(#{detail.document.number})</bdi></small><small>المستودع: {item.warehouse}</small></td>
    <td><Numeric value={item.quantity} /><small>{item.unit || "وحدة"}</small><small title="تكلفة الوحدة"><Numeric value={item.unit_cost} money /></small><span className={styles.stockDelivery} data-confirmed={confirmed}>{confirmed ? "سلّم" : "لم يؤكد التسليم"}</span></td>
    <td>{typeof item.balance === "number" ? <Numeric value={item.balance} /> : "غير متاح"}<small>الرصيد الحالي في المستودع</small></td>
  </tr>)}</tbody></table></div> : <p className={styles.empty}>لا توجد حركات مخزون مرتبطة بهذه الفاتورة</p>}<p className={styles.hint}>حالة التسليم توثيق تشغيلي ولا تعيد ترحيل حركات المخزون</p></div>;
}

const statusNames: Record<string, string> = { paid: "مدفوع", unpaid: "غير مدفوع", partial: "مدفوع جزئيًا", cancelled: "ملغى بالمرتجع" };
export function renderInvoiceInstallments({ detail, schedule, customer, frequency, paid, blocked, onCustomer, onInvoice, onPayments, onSettle }: {
  detail: InvoiceDetail; schedule: InvoiceSchedule; customer: string; frequency: string; paid: number; blocked: boolean;
  onCustomer?: () => void; onInvoice: () => void; onPayments: () => void; onSettle?: (document: FinanceDocument, amount?: number) => void;
}) {
  const invoice = detail.document, rows = invoiceInstallmentBalances(invoice, schedule);
  const next = rows.find(row => row.remaining > 0), avatar = customer.trim().slice(0, 1) || "؟";
  return <div className={styles.agreementScroll} role="region" tabIndex={0} aria-label="تفاصيل اتفاقية التقسيط">
    <div className={styles.agreementSummary}>
      <div className={styles.agreementCustomer}><div className={styles.agreementPerson}><span className={styles.agreementAvatar} aria-hidden="true">{avatar}</span><strong>{customer}</strong></div>{onCustomer && <button type="button" disabled={blocked} onClick={() => { if (!blocked) onCustomer(); }}><UserRound size={14} aria-hidden="true" />عرض الصفحة الشخصية</button>}</div>
      <div className={styles.agreementAmounts}><div><strong><Numeric value={invoice.total} money /></strong><small>مبلغ اتفاقية التقسيط</small></div><div><strong><Numeric value={schedule.amount} money /></strong><span> {frequency}</span><small>مبلغ القسط</small></div></div>
      <div className={styles.agreementInvoice}><button type="button" className={styles.agreementInvoiceLink} disabled={blocked} onClick={() => { if (!blocked) onInvoice(); }}><bdi>#{String(detail.invoice?.number ?? invoice.number).padStart(6, "0")}</bdi></button><small>رقم الفاتورة</small><div className={styles.agreementPaid}><span><Numeric value={paid} money /> المبلغ المدفوع</span><progress max={Math.max(invoice.total, .01)} value={paid} aria-label="المبلغ المدفوع من إجمالي الاتفاقية" /><span><Numeric value={invoice.total} money /> إجمالي المبلغ</span></div></div>
    </div>
    <dl className={styles.agreementDates}><div><dt>تاريخ بدء الأقساط</dt><dd><time dateTime={schedule.start}>{schedule.start}</time></dd></div><div><dt>تاريخ استحقاق القسط</dt><dd>{next ? <time dateTime={next.date}>{next.date}</time> : "لا يوجد قسط مستحق"}</dd></div></dl>
    {schedule.note && <p className={styles.hint}>{schedule.note}</p>}
    <div className={styles.tableWrap}><table className={styles.agreementTable}><thead><tr><th>الرقم التعريفي</th><th>معلومات العميل</th><th>القيمة</th><th>تاريخ الاستحقاق</th><th>الحالة</th><th><span className={styles.visuallyHidden}>الإجراءات</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.number}>
      <td>{row.number}</td><td><div className={styles.agreementPerson}><span className={styles.agreementAvatar} aria-hidden="true">{avatar}</span><strong>{customer}</strong></div></td><td><strong><Numeric value={row.amount} money /></strong>{row.paid > 0 && row.remaining > 0 && <small>مدفوع <Numeric value={row.paid} money /></small>}{row.cancelled > 0 && <small>مرتجع <Numeric value={row.cancelled} money /></small>}</td><td><time dateTime={row.date}>{row.date}</time></td><td><span className={styles.installmentStatus} data-status={row.status}>{statusNames[row.status]}</span></td>
      <td>{row.remaining > 0 && <details className={styles.installmentMenu} onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}><summary aria-label={`خيارات القسط ${row.number}`}><MoreHorizontal size={17} aria-hidden="true" /></summary><div>{onSettle && <button type="button" disabled={blocked || invoice.refunded || invoice.outstanding <= .009} onClick={event => { if (!blocked && !invoice.refunded && invoice.outstanding > .009) { event.currentTarget.closest("details")?.removeAttribute("open"); onSettle(invoice, Math.min(row.remaining, invoice.outstanding)); } }}><CreditCard size={13} aria-hidden="true" />تسجيل دفعة</button>}<button type="button" disabled={blocked} onClick={() => { if (!blocked) onPayments(); }}>عرض المدفوعات</button></div></details>}</td>
    </tr>)}</tbody></table></div><p className={styles.hint}>يُوزّع التحصيل المسجل على الأقساط حسب ترتيب الاستحقاق وتُخصم المرتجعات من نهاية الجدول</p>
  </div>;
}
