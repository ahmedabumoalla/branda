import { z } from "zod";
import type { FinanceDocument } from "./brand-finance";
import type { InvoiceDetail } from "./invoice-management";
import type { InvoicePayment } from "./payment-management";

export type CustomerPaymentRow = {
  id: string; invoiceId: string; initial: boolean; number: number | null; invoiceNumber: number; invoiceDisplayNumber: string;
  invoiceStatus: "paid" | "partial" | "unpaid" | "returned"; customerId: string | null; customerName: string;
  amount: number; effectiveAmount: number; date: string; status: "completed" | "pending" | "deleted";
  method: "cash" | "bank" | "pos" | "credit"; accountId: string | null; accountName: string; collectorName: string; reference: string;
};
export type CustomerPaymentDetail = { document: FinanceDocument; detail: InvoiceDetail; payment: InvoicePayment };
export const customerPaymentFiltersSchema = z.object({
  query: z.string().max(100).optional(), invoiceNumber: z.string().max(40).optional(), paymentNumber: z.string().regex(/^\d{0,20}$/).optional(),
  partyId: z.uuid().optional(), method: z.enum(["cash", "bank", "pos", "credit"]).optional(), status: z.enum(["completed", "pending", "deleted"]).optional(),
  from: z.iso.date().optional(), to: z.iso.date().optional(), sort: z.enum(["newest", "oldest", "amount_desc", "amount_asc"]).default("newest"),
  offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(30),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, { message: "تاريخ البداية بعد تاريخ النهاية" });
export type CustomerPaymentFilters = z.input<typeof customerPaymentFiltersSchema>;
export function normalizeCustomerPaymentNumber(value: string) { return value.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0)).replace(/^#\s*/, ""); }
