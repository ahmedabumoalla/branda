import { z } from "zod";
import { invoiceDraftSchema, type InvoiceDraftPayload } from "./invoice-draft";
import { companyAmounts } from "./company-invoice";

export const recurringInvoiceSchema = z.object({
  name: z.string().trim().min(1).max(160), interval: z.number().int().min(1).max(365),
  unit: z.enum(["day", "week", "month", "year"]), count: z.number().int().min(0).max(10000),
  firstDate: z.iso.date().refine(date => date >= "1900-01-01", "اختر تاريخًا من سنة ١٩٠٠ أو بعدها"), leadDays: z.number().int().min(0).max(365), paymentTermsDays: z.number().int().min(0).max(3650),
  showPeriod: z.boolean(), active: z.boolean(), document: invoiceDraftSchema,
}).strict();
export type RecurringInvoicePayload = z.infer<typeof recurringInvoiceSchema>;
export type RecurringInvoiceSummary = {
  id: string; number: number; revision: number; name: string; customerName: string; warehouseName: string; interval: number; unit: RecurringInvoicePayload["unit"];
  total: number; subtotal: number; discount: number; tax: number; generatedCount: number; count: number;
  nextDate: string | null; nextIssueDate: string | null; lastIssuedAt: string | null; lastError: string | null;
  status: "active" | "paused" | "completed"; updatedAt: string;
};
export type RecurringInvoiceOccurrence = { id: string; index: number; scheduledDate: string; issuedAt: string; invoiceId: string; invoiceNumber: number; displayNumber: string; total: number; dueDate: string; periodStart: string; periodEnd: string };
export type RecurringInvoicePreview = { index: number; date: string; issueDate: string; dueDate: string; periodStart: string; periodEnd: string };
export type RecurringInvoiceRecord = RecurringInvoiceSummary & { payload: RecurringInvoicePayload; lines: { productId: string; name: string; kind: "product" | "service"; description: string; quantity: number; price: number; discount: number; net: number; tax: number; total: number; vatRate: number }[]; invoices: RecurringInvoiceOccurrence[]; historyTotal: number; historyOffset: number; upcoming: RecurringInvoicePreview[] };
export const recurringInvoiceFiltersSchema = z.object({ query: z.string().max(100).optional(), status: z.enum(["active", "paused", "completed"]).optional(), partyId: z.uuid().optional(), offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(30) }).strict();
export type RecurringInvoiceFilters = z.input<typeof recurringInvoiceFiltersSchema>;
export function recurringOccurrenceDate(firstDate: string, unit: RecurringInvoicePayload["unit"], interval: number, index: number): string {
  if (!z.iso.date().safeParse(firstDate).success || firstDate < "1900-01-01" || !Number.isInteger(interval) || interval < 1 || !Number.isInteger(index) || index < 0) throw new Error("راجع بيانات تكرار الفاتورة");
  const [year, month, day] = firstDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1, day));
  if (unit === "day" || unit === "week") target.setUTCDate(day + interval * index * (unit === "week" ? 7 : 1));
  else {
    const months = (unit === "year" ? 12 : 1) * interval * index;
    target.setUTCDate(1); target.setUTCMonth(month - 1 + months);
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
  }
  if (target.getUTCFullYear() > 9999) throw new Error("تاريخ التكرار خارج النطاق المسموح");
  return target.toISOString().slice(0, 10);
}
function addDays(date: string, days: number) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); if (value.getUTCFullYear() > 9999 || value.getUTCFullYear() < 1) throw new Error("تاريخ التكرار خارج النطاق المسموح"); return value.toISOString().slice(0, 10); }
export function recurrencePreview(payload: RecurringInvoicePayload, startIndex = 0, limit = 5): RecurringInvoicePreview[] {
  return Array.from({ length: Math.max(0, Math.min(limit, 30, payload.count ? payload.count - startIndex : limit)) }, (_, offset) => {
    const index = startIndex + offset, date = recurringOccurrenceDate(payload.firstDate, payload.unit, payload.interval, index);
    return { index, date, issueDate: addDays(date, -payload.leadDays), dueDate: addDays(date, payload.paymentTermsDays), periodStart: date, periodEnd: addDays(recurringOccurrenceDate(payload.firstDate, payload.unit, payload.interval, index + 1), -1) };
  });
}
export function recurringInvoiceAmounts(payload: RecurringInvoicePayload) {
  const invoice = payload.document.invoice;
  return companyAmounts(invoice.lines, [], invoice.discountEnabled === false ? 0 : invoice.discountValue, invoice.discountKind, invoice.vatRate ?? 0, invoice.taxInclusive ?? false);
}
export type RecurringInvoiceDocument = InvoiceDraftPayload;
