import { z } from "zod";
import { invoiceDraftSchema, type InvoiceDraftPayload } from "./invoice-draft";
import { companyAmounts } from "./company-invoice";
import type { FinanceSnapshot } from "./brand-finance";
import type { CompanyInvoicePreview } from "@/lib/export/company-invoice-preview-pdf";

export const quotePayloadSchema = z.object({
  document: invoiceDraftSchema,
  date: z.iso.date(),
  validUntil: z.union([z.iso.date(), z.literal("")]),
  status: z.enum(["draft", "ready", "accepted", "rejected"]),
}).strict().refine(value => !value.validUntil || value.validUntil >= value.date, { message: "تاريخ انتهاء العرض يسبق تاريخ العرض" });
export type QuotePayload = z.infer<typeof quotePayloadSchema>;
export type QuoteRecord = {
  id: string; number: number; displayNumber?: string; revision: number; payload: QuotePayload;
  customerName: string; warehouseName: string; lines: { productId: string; name: string }[];
  total: number; subtotal: number; discount: number; tax: number;
  createdAt: string; updatedAt: string; invoiceDraftId: string | null;
};
export const quoteStatusLabels = { draft: "مسودة", ready: "جاهز", accepted: "مقبول", rejected: "مرفوض", expired: "منتهي", converted: "محول إلى فاتورة" };
export function riyadhDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date()); }
export function quoteStatus(quote: QuoteRecord, today = riyadhDate()): keyof typeof quoteStatusLabels {
  if (quote.invoiceDraftId) return "converted";
  if (quote.payload.status !== "rejected" && quote.payload.status !== "draft" && quote.payload.validUntil && quote.payload.validUntil < today) return "expired";
  return quote.payload.status;
}
export function newQuote(data: FinanceSnapshot): QuotePayload {
  return { date: riyadhDate(), validUntil: "", status: "draft", document: invoiceDraftSchema.parse({
    invoice: { lines: [{ key: 1, productId: "", quantity: 1, price: 0 }], warehouseId: data.warehouses.find(w => w.active)?.id ?? "", partyId: "", accountId: "", paymentKind: "credit", discountValue: 0, discountKind: "amount", discountEnabled: false, vatRate: data.settings.vat_rate, taxInclusive: data.settings.tax_inclusive, note: "" },
    template: "standard", extraFields: [], deliveryMethod: "print", supplyDate: riyadhDate(),
  }) };
}
export function quoteAmounts(document: InvoiceDraftPayload) {
  const i = document.invoice;
  return companyAmounts(i.lines, [], i.discountEnabled === false ? 0 : i.discountValue, i.discountKind, i.vatRate ?? 0, i.taxInclusive ?? false);
}
export function quotePreview(payload: QuotePayload, names: { brand: string; customer: string; warehouse: string; products: { id: string; name: string }[] }, saved?: QuoteRecord): CompanyInvoicePreview {
  const amounts = quoteAmounts(payload.document);
  return { brand: names.brand, customer: names.customer || "لم يُحدد العميل", taxNumber: "", thermal: payload.document.template === "thermal",
    note: [payload.document.invoice.note, ...payload.document.extraFields.map(f => `${f.title}: ${f.value}`)].filter(Boolean).join("\n"),
    ...amounts, quote: { number: saved?.number, displayNumber: saved?.displayNumber, date: payload.date, validUntil: payload.validUntil, warehouse: names.warehouse, draft: payload.status === "draft" },
    lines: payload.document.invoice.lines.map((line, index) => ({ ...amounts.rows[index], quantity: line.quantity, description: line.description, name: names.products.find(p => p.id === line.productId)?.name || "لم يُحدد الصنف" })),
  };
}
