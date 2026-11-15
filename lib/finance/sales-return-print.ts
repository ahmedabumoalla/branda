import type { FinanceSnapshot } from "./brand-finance";
import type { InvoiceDetail } from "./invoice-management";
import type { SalesReturnDetail } from "./sales-return";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";
import { getFinanceReceiptTaxStatus } from "./receipt-tax";

const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh", calendar: "gregory" }).format(new Date(value));

/** Posted amounts and archived identities only; never use current prices or tax settings. */
export function salesReturnPreview(record: SalesReturnDetail, snapshot: Pick<FinanceSnapshot, "cafe">, source?: InvoiceDetail): CompanyInvoicePreview {
  const original = source?.document;
  const returned = source?.related.find(item => item.id === record.id && item.kind === "refund" && item.reference_id === record.sourceId);
  if (source && (original?.id !== record.sourceId || !returned)) throw new Error("المرتجع لا يرتبط بهذه الفاتورة");
  const archived = source?.invoice;
  const seller = archived?.seller ? { name: archived.seller.name, vatNumber: archived.seller.vatNumber } : returned?.receipt_seller ?? original?.receipt_seller;
  const fiscal = returned && getFinanceReceiptTaxStatus({ ...returned, receipt_seller: seller }) === "ready" ? {
    sellerName: seller!.name, sellerVat: seller!.vatNumber, sellerAddress: archived?.seller.address ?? "",
    customerAddress: archived?.customer.address ?? "", invoiceType: archived?.type ?? "simplified",
    issuedAt: record.createdAt, sourceDate: date(archived?.issuedAt ?? original!.created_at),
  } : undefined;
  return {
    brand: seller?.name || snapshot.cafe.name, customer: archived?.customer.name || record.customerName,
    taxNumber: archived?.customer.vatNumber ?? "", thermal: false,
    note: record.note, subtotal: record.subtotal, discount: record.discount, tax: record.tax, total: record.total,
    lines: record.lines.map(line => ({ name: line.name, description: line.description, quantity: line.quantity,
      price: line.price, discount: line.discount, tax: line.tax, total: line.total })),
    salesReturn: { number: record.number, date: date(record.createdAt),
      sourceNumber: archived?.displayNumber || String(archived?.number ?? record.sourceNumber),
      warehouse: record.warehouseName || "بدون حركة مخزنية", paid: record.paid, debtReduced: record.debtReduced,
      taxInclusive: record.taxInclusive, fiscal },
  };
}
