import { z } from "zod";
import { companyAmounts } from "./company-invoice";
import type { FinanceSnapshot } from "./brand-finance";
import { riyadhDate } from "./quotation";

const decimal = (max: number, places: number) => z.number().finite().min(0).max(max).refine(n => Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) < 0.00001);
const optionalId = z.union([z.uuid(), z.literal("")]);
export const creditNotePayloadSchema = z.object({
  partyId: optionalId, warehouseId: optionalId,
  date: z.iso.date(), issueDate: z.iso.date(),
  salespersonId: z.uuid().nullable(), sourceInvoiceId: z.uuid().nullable(),
  reason: z.string().trim().max(500), note: z.string().max(1000), terms: z.string().max(3000),
  template: z.enum(["standard", "thermal"]), deliveryMethod: z.literal("print"),
  stockRequired: z.boolean(), discountValue: decimal(1e9, 2), discountKind: z.enum(["amount", "percent"]),
  vatRate: decimal(100, 2), taxInclusive: z.boolean(),
  lines: z.array(z.object({
    key: z.number().int().nonnegative(), productId: optionalId,
    quantity: decimal(9999, 3).refine(n => n > 0), price: decimal(1e7, 2),
    description: z.string().max(500).optional(), discount: decimal(1e9, 2).optional(),
    discountKind: z.enum(["amount", "percent"]).optional(), vatRate: decimal(100, 2).optional(),
  }).strict()).min(1).max(100),
}).strict().refine(p => p.discountKind !== "percent" || p.discountValue <= 100)
  .refine(p => p.lines.every(l => l.discountKind !== "percent" || (l.discount ?? 0) <= 100));
export type CreditNotePayload = z.infer<typeof creditNotePayloadSchema>;
export type CreditNoteRecord = {
  id: string; number: number; displayNumber?: string; revision: number; status: "draft" | "issued" | "deleted";
  stockStatus: "none" | "pending" | "received" | "rejected";
  payload: CreditNotePayload; customerName: string; warehouseName: string; createdByName: string; salespersonName: string;
  sourceNumber: number | null; createdAt: string; updatedAt: string; issuedAt: string | null;
  subtotal: number; discount: number; tax: number; total: number;
  journalId: string | null; stockDocumentId: string | null;
  lines: { productId: string; name: string; itemId: string | null; quantity: number; price: number; description: string; unitCost: number; discount: number; net: number; tax: number; total: number; vatRate: number; components: { itemId: string; quantity: number; unitCost: number }[] }[];
  events: { id: string; action: string; actorName: string; createdAt: string; note: string }[];
};
export const creditNoteFiltersSchema = z.object({
  query: z.string().max(100).optional(), partyId: z.uuid().optional(),
  status: z.enum(["draft", "issued"]).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(30),
}).strict();
export type CreditNoteFilters = z.input<typeof creditNoteFiltersSchema>;
export const creditNoteStatusLabels = { draft: "مسودة", issued: "صادر", deleted: "محذوف" };
export const creditNoteStockLabels = { none: "دون استلام مخزني", pending: "بانتظار الاستلام", received: "تم الاستلام", rejected: "مرفوض" };
export function creditNoteAmounts(p: CreditNotePayload) {
  return companyAmounts(p.lines, [], p.discountValue, p.discountKind, p.vatRate, p.taxInclusive);
}
export function newCreditNote(snapshot: FinanceSnapshot): CreditNotePayload {
  return { partyId: "", warehouseId: snapshot.warehouses.find(w => w.active)?.id ?? "", date: riyadhDate(), issueDate: riyadhDate(), salespersonId: null, sourceInvoiceId: null, reason: "", note: "", terms: "", template: "standard", deliveryMethod: "print", stockRequired: false, discountValue: 0, discountKind: "amount", vatRate: snapshot.settings.vat_rate, taxInclusive: snapshot.settings.tax_inclusive, lines: [{ key: 1, productId: "", quantity: 1, price: 0 }] };
}
