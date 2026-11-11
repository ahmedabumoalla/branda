import type { FinanceDocument, FinanceSnapshot } from "./brand-finance";
import type { InvoiceDetail } from "./invoice-management";
import type { InvoiceFile } from "./company-invoice-options";

export type PaymentReceiptMode = "view" | "standard" | "thermal";
export type PaymentReceiptData = { id: string; brand: string; customer: string; paymentNumber: string; invoiceNumber: string; date: string; amount: number; method: string; account: string; actor: string; note: string; refund: boolean; status?: "completed" | "pending" | "deleted"; reference?: string; details?: string; attachments?: InvoiceFile[]; brandSlug?: string };

export function paymentReceiptData(payment: FinanceDocument, detail: InvoiceDetail, snapshot: FinanceSnapshot): PaymentReceiptData {
  const initial = payment.id === detail.document.id;
  const current = detail.payments?.find(item => item.id === payment.id);
  const account = snapshot.accounts.find(item => item.id === (current?.accountId ?? payment.account_id));
  const actor = current?.collectorName || (payment.created_by && payment.created_by === snapshot.userId ? "المستخدم الحالي" : detail.activity.find(item => item.documentId === payment.id)?.actor || snapshot.staff.find(item => item.user_id === payment.created_by)?.name || (payment.created_by === detail.creator.id ? detail.creator.name : "غير مسجل"));
  const method = current?.method ?? account?.kind;
  return {
    id: payment.id, brand: snapshot.cafe.name, customer: detail.invoice?.customer.name || detail.customer?.name || "عميل نقدي",
    paymentNumber: initial ? "دفعة عند إصدار الفاتورة" : String(payment.number).padStart(6, "0"),
    invoiceNumber: detail.invoice?.displayNumber || detail.document.display_number || String(detail.invoice?.number ?? detail.document.number).padStart(6, "0"),
    date: current?.date ?? payment.created_at, amount: current?.amount ?? payment.paid,
    method: method === "credit" ? "رصيد مقدم" : method === "bank" ? "تحويل بنكي" : method === "cash" ? "نقدي" : method === "pos" ? "نقاط البيع" : account?.name || "غير محددة",
    account: current?.accountName || account?.name || "غير مسجل", actor, note: current?.receiptNote ?? (initial ? "" : payment.note), refund: payment.kind === "refund",
    status: current?.status ?? "completed", reference: current?.reference, details: current?.details, attachments: current?.attachments ?? [], brandSlug: snapshot.cafe.slug,
  };
}
