import { ArrowDownUp, BadgeCheck, Banknote, CalendarDays, Clock3, CreditCard, Eye, Landmark, MoreHorizontal, Pencil, PlusCircle, Printer, Trash2 } from "lucide-react";
import type { FinanceDocument, FinanceSnapshot } from "@/lib/finance/brand-finance";
import type { InvoiceDetail } from "@/lib/finance/invoice-management";
import type { PaymentReceiptMode } from "@/lib/finance/payment-receipt";
import type { InvoicePayment } from "@/lib/finance/payment-management";
import { Numeric } from "./finance-ui";
import styles from "./finance-invoice-detail.module.css";

export type PaymentOrder = "newest" | "amount-asc" | "amount-desc";
function paymentDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "غير مسجل" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function renderInvoicePayments({ detail, snapshot, blocked, order, onOrder, onPayment, onSettle, onInvoice, onEdit, onDelete }: {
  detail: InvoiceDetail; snapshot: FinanceSnapshot; blocked: boolean; order: PaymentOrder; onOrder: (order: PaymentOrder) => void;
  onPayment: (document: FinanceDocument, mode: PaymentReceiptMode) => void; onSettle?: (document: FinanceDocument) => void; onInvoice: () => void;
  onEdit?: (payment: InvoicePayment) => void; onDelete?: (payment: InvoicePayment) => void;
}) {
  const invoice = detail.document;
  const collections = detail.related.filter(document => document.kind === "settlement" || document.kind === "receipt");
  const refunds = detail.related.filter(document => document.kind === "refund");
  const activePayments = detail.payments?.filter(payment => payment.status !== "deleted");
  const paid = Math.round((activePayments ? activePayments.reduce((sum, payment) => sum + payment.effectiveAmount, 0) : invoice.paid + collections.reduce((sum, document) => sum + document.paid, 0)) * 100) / 100;
  const refunded = invoice.refunded_paid ?? refunds.reduce((sum, document) => sum + document.paid, 0);
  const customer = detail.invoice?.customer.name || detail.customer?.name || "عميل نقدي";
  const number = String(detail.invoice?.number ?? invoice.number).padStart(6, "0");
  const status = invoice.refunded ? "مرتجع كامل" : invoice.outstanding <= .009 ? "مدفوعة" : paid - refunded > .009 ? "مدفوعة جزئيًا" : "غير مدفوعة";
  // The issue-time payment belongs to the invoice itself, not a fabricated payment voucher.
  const rows: { document: FinanceDocument; initial: boolean; payment?: InvoicePayment }[] = activePayments ? activePayments.flatMap(payment => {
    const document = payment.initial ? invoice : detail.related.find(document => document.id === payment.id);
    return document ? [{ document, initial: payment.initial, payment }] : [];
  }) : [...(invoice.paid > .009 ? [{ document: invoice, initial: true }] : []), ...collections.filter(document => document.paid > .009).map(document => ({ document, initial: false }))];
  rows.push(...refunds.filter(document => document.paid > .009).map(document => ({ document, initial: false })));
  rows.sort((a, b) => order === "newest" ? (b.payment?.date ?? b.document.created_at).localeCompare(a.payment?.date ?? a.document.created_at) || b.document.id.localeCompare(a.document.id) : (order === "amount-asc" ? 1 : -1) * ((a.payment?.amount ?? a.document.paid) - (b.payment?.amount ?? b.document.paid)) || a.document.id.localeCompare(b.document.id));
  function creator(document: FinanceDocument) {
    if (document.created_by && document.created_by === snapshot.userId) return "المستخدم الحالي";
    return detail.activity.find(activity => activity.documentId === document.id)?.actor || snapshot.staff.find(staff => staff.user_id === document.created_by)?.name || (document.created_by === detail.creator.id ? detail.creator.name : "غير مسجل");
  }
  return <div className={styles.paymentsView}>
    <h3 className={styles.paymentHeading}>ملخص الدفع</h3>
    <dl className={styles.paymentMetrics}>
      <div><dt>إجمالي الفاتورة</dt><dd><Numeric value={invoice.total} money /></dd></div>
      <div data-tone="paid"><dt>المدفوع</dt><dd><Numeric value={paid} money /></dd>{refunded > .009 && <small>قبل الاسترداد</small>}</div>
      <div data-tone="due"><dt>الباقي</dt><dd><Numeric value={invoice.outstanding} money /></dd></div>
      <div data-tone="refund"><dt>المبلغ المسترد</dt><dd><Numeric value={refunded} money /></dd></div>
      <div><dt>العملة</dt><dd><bdi>SAR</bdi></dd></div>
    </dl>
    <div className={styles.paymentListHeading}><h3>عمليات الدفع على الفاتورة <bdi>#{number}</bdi></h3>{onSettle && <button type="button" disabled={blocked || invoice.refunded || invoice.outstanding <= .009} onClick={() => { if (!blocked && !invoice.refunded && invoice.outstanding > .009) onSettle(invoice); }}><PlusCircle size={16} aria-hidden="true" />إضافة عملية دفع</button>}</div>
    {rows.length ? <div className={styles.paymentTableWrap}><table className={styles.paymentTable}><caption className={styles.visuallyHidden}>عمليات الدفع المسجلة للفواتير</caption><thead><tr><th scope="col">رقم عملية الدفع</th><th scope="col">رقم الفاتورة</th><th scope="col">الطريقة</th><th scope="col">المبلغ</th><th scope="col"><label className={styles.paymentSort}><ArrowDownUp size={14} aria-hidden="true" /><select aria-label="ترتيب عمليات الدفع" value={order} onChange={event => onOrder(event.target.value as PaymentOrder)}><option value="newest">الأحدث</option><option value="amount-asc">المبلغ تصاعديًا</option><option value="amount-desc">المبلغ تنازليًا</option></select></label></th></tr></thead><tbody>{rows.map(({ document, initial, payment }) => {
      const account = snapshot.accounts.find(account => account.id === (payment?.accountId ?? document.account_id));
      const method = payment ? ({ cash: "نقدي", bank: "تحويل بنكي", pos: "نقاط البيع", credit: "رصيد مقدم" }[payment.method]) : account?.kind === "bank" ? "تحويل بنكي" : account?.kind === "cash" ? "نقدي" : account?.kind === "pos" ? "نقاط البيع" : account?.name || "غير محددة";
      const Icon = account?.kind === "bank" ? Landmark : account?.kind === "cash" ? Banknote : CreditCard;
      const refund = document.kind === "refund";
      const paymentPending = payment?.status === "pending";
      const canReceipt = !paymentPending && (payment?.effectiveAmount ?? document.paid) > .009;
      const lockedReason = payment?.blockedReason || (!payment ? refund ? "هذا إيصال استرداد وليس دفعة قابلة للتعديل" : "أعد تحميل الفاتورة لتحديث صلاحيات الدفعة" : !onEdit ? "لا تملك صلاحية تعديل دفعات الفواتير" : "");
      const paymentDateValue = payment?.date ?? document.created_at;
      const rowLabel = initial ? "دفعة عند إصدار الفاتورة" : `عملية الدفع ${document.number}`;
      return <tr key={document.id}>
        <td><button type="button" className={styles.paymentLink} aria-label={`عرض ${rowLabel}`} disabled={blocked} onClick={() => onPayment(document, "view")}>{customer}</button><span className={styles.paymentMeta}>{initial ? <span>دفعة عند إصدار الفاتورة</span> : <bdi>#{String(document.number).padStart(6, "0")}</bdi>}<time dateTime={paymentDateValue} dir="ltr">{paymentDate(paymentDateValue)}</time></span></td>
        <td><div className={styles.paymentInvoice}><button type="button" className={styles.paymentLink} onClick={onInvoice}>فاتورة <bdi>#{number}</bdi></button><span className={styles.paymentInvoiceStatus}>{status}</span></div><span className={styles.paymentMeta}><CalendarDays size={12} aria-hidden="true" /><time dateTime={invoice.created_at} dir="ltr">{paymentDate(invoice.created_at)}</time></span></td>
        <td><span className={styles.paymentMethod}><Icon size={14} aria-hidden="true" />{method}</span>{account && <small className={styles.paymentAccount}>{account.name}</small>}<small className={styles.paymentActor}>بواسطة: {payment?.collectorName || creator(document)}</small></td>
        <td><strong className={styles.paymentAmount}><Numeric value={payment?.amount ?? document.paid} money /></strong><span className={styles.paymentComplete} data-refund={refund} data-pending={paymentPending}>{paymentPending ? <Clock3 size={12} aria-hidden="true" /> : <BadgeCheck size={12} aria-hidden="true" />}{refund ? "مسترد" : paymentPending ? "معلق" : "مكتمل"}</span></td>
        <td><div className={styles.paymentMenu}><button type="button" popoverTarget={"payment-actions-" + document.id} aria-label={"إجراءات " + rowLabel} disabled={blocked} onClick={event => { const panel = event.currentTarget.nextElementSibling as HTMLElement; const rect = event.currentTarget.getBoundingClientRect(); panel.style.left = Math.max(10, Math.min(window.innerWidth - 210, rect.left)) + "px"; panel.style.top = Math.max(10, Math.min(window.innerHeight - 340, rect.bottom + 5)) + "px"; }}><MoreHorizontal size={18} aria-hidden="true" /></button><div id={"payment-actions-" + document.id} popover="auto" className={styles.paymentMenuPanel} role="group" aria-label={"إجراءات " + rowLabel}><button type="button" disabled={blocked} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); onPayment(document, "view"); }}><Eye size={15} aria-hidden="true" />عرض</button><button type="button" disabled={blocked || !payment?.canEdit || !onEdit} aria-describedby={lockedReason ? "payment-lock-" + document.id : undefined} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); if (!blocked && payment?.canEdit) onEdit?.(payment); }}><Pencil size={15} aria-hidden="true" />تعديل</button><button type="button" disabled={blocked || !payment?.canDelete || !onDelete} aria-describedby={lockedReason ? "payment-lock-" + document.id : undefined} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); if (!blocked && payment?.canDelete) onDelete?.(payment); }}><Trash2 size={15} aria-hidden="true" />حذف</button><button type="button" disabled={blocked || !canReceipt} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); if (canReceipt) onPayment(document, "standard"); }}><Printer size={15} aria-hidden="true" />إيصال مدفوعات</button><button type="button" disabled={blocked || !canReceipt} onClick={event => { event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); if (canReceipt) onPayment(document, "thermal"); }}><Printer size={15} aria-hidden="true" />إيصال مدفوعات حراري</button>{lockedReason && <p id={"payment-lock-" + document.id}>{lockedReason}</p>}{paymentPending && <p>إيصال المدفوعات متاح بعد اكتمال التحصيل</p>}</div></div></td>
      </tr>;
    })}</tbody></table></div> : <p className={styles.empty}>لا توجد عمليات دفع مسجلة على هذه الفاتورة</p>}
  </div>;
}
