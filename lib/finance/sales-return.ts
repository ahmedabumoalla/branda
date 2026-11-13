import { z } from "zod";

export function normalizeSalesReturnQuery(value: string | undefined) {
  const original = (value ?? "").trim();
  const query = original.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  return /^#?\s*\d+$/.test(query) ? query.replace(/^#?\s*0*(?=\d)/, "") : original;
}

export type SalesReturnSummary = {
  id: string; number: number; sourceId: string; sourceNumber: number; partyId: string | null;
  customerName: string; createdAt: string; createdByName: string; subtotal: number; discount: number;
  total: number; tax: number; paid: number; debtReduced: number; paymentStatus: "cash" | "credit" | "mixed";
  paymentMethod: string | null; accountName: string; stockStatus: "none" | "pending" | "received" | "rejected";
  warehouseName: string; stockRevision: number;
};
export type SalesReturnDetail = SalesReturnSummary & {
  note: string; taxInclusive: boolean; stockDocumentId: string | null;
  lines: { id: string; name: string; description: string; quantity: number; price: number; discount: number; net: number; tax: number; total: number }[];
  events: { id: string; action: string; actorName: string; createdAt: string; note: string }[];
  stockLines: { id: string; itemName: string; quantity: number; receivedQuantity: number; unitCost: number; total: number; costStatus: string }[];
};
export type SalesReturnStockResult = Pick<SalesReturnDetail, "id" | "stockStatus" | "stockRevision" | "stockDocumentId">;
export const salesReturnFiltersSchema = z.object({
  query: z.string().max(100).optional(), partyId: z.uuid().optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  paymentStatus: z.enum(["cash", "credit", "mixed"]).optional(), stockStatus: z.enum(["none", "pending", "received", "rejected"]).optional(),
  offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(30),
}).strict();
export type SalesReturnFilters = z.input<typeof salesReturnFiltersSchema>;
export const salesReturnStockLabels = { none: "دون حركة مخزنية", pending: "بانتظار الاستلام", received: "تم الاستلام", rejected: "مرفوض" };
export const salesReturnPaymentLabels = { cash: "أعيد المبلغ للعميل", credit: "تخفيض المبلغ الآجل", mixed: "مبلغ معاد وتخفيض آجل" };
