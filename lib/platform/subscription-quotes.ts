import { z } from "zod";
import { INVOICE_SELLER, invoiceCustomerSchema, invoiceDescription, invoiceLineAmounts, type SubscriptionInvoice, type SubscriptionInvoiceLine } from "./subscription-invoices";

const money = z.number().int().min(0).max(9_999_999_999);
const name = z.string().trim().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
export function quoteItemTotalCents(quantity: number, unitPriceCents: number) {
  const scaledQuantity = Math.round(quantity * 1000);
  if (!Number.isSafeInteger(scaledQuantity) || !Number.isSafeInteger(unitPriceCents) || scaledQuantity < 0 || unitPriceCents < 0) return NaN;
  return Number((BigInt(scaledQuantity) * BigInt(unitPriceCents) + BigInt(500)) / BigInt(1000));
}
export const quoteCustomerSchema = invoiceCustomerSchema.extend({ street: z.string().trim().max(200).default(""), fullAddress: z.string().trim().max(500).default("") }).strict();
export const quoteLineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subscription"), name, months: z.number().int().min(1).max(120), amountCents: money }).strict(),
  z.object({ kind: z.literal("item"), name, quantity: z.number().positive().max(1_000_000).refine(value => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001), unitPriceCents: money }).strict(),
]).refine(line => line.kind === "subscription" || quoteItemTotalCents(line.quantity, line.unitPriceCents) <= 9_999_999_999);
export const subscriptionQuoteDraftSchema = z.object({ customer: quoteCustomerSchema, validUntil: date, taxInclusive: z.boolean(), lines: z.array(quoteLineSchema).min(1).max(20), scopeWork: z.string().trim().max(12000).default("") }).strict();
export const saveSubscriptionQuoteSchema = z.object({ id: z.uuid(), requestId: z.uuid(), revision: z.number().int().min(0), draft: subscriptionQuoteDraftSchema }).strict();
export const convertSubscriptionQuoteSchema = z.object({ id: z.uuid(), requestId: z.uuid(), revision: z.number().int().positive(), customer: quoteCustomerSchema, dueDate: date }).strict();
export type QuoteCustomer = z.infer<typeof quoteCustomerSchema>;
export type QuoteLineInput = z.infer<typeof quoteLineSchema>;
export type SubscriptionQuoteDraft = z.infer<typeof subscriptionQuoteDraftSchema>;
export type SaveSubscriptionQuoteInput = z.infer<typeof saveSubscriptionQuoteSchema>;
export type ConvertSubscriptionQuoteInput = z.infer<typeof convertSubscriptionQuoteSchema>;
export type SubscriptionQuote = SubscriptionInvoice & { documentKind: "quote"; revision: number; updatedAt: string; convertedInvoiceId: string | null; scopeWork: string; draft: SubscriptionQuoteDraft };
export type SubscriptionQuoteRow = { id: string; quote_number: string; created_at: string; customer_name: string; total_cents: number; revision: number; converted_invoice_id: string | null };
export type SubscriptionQuoteList = { rows: SubscriptionQuoteRow[]; total: number; page: number; search: string };

export function quoteLineAmounts(line: QuoteLineInput, inclusive: boolean): SubscriptionInvoiceLine {
  const amountCents = line.kind === "subscription" ? line.amountCents : quoteItemTotalCents(line.quantity, line.unitPriceCents);
  return { planId: "", planName: line.name, months: line.kind === "subscription" ? line.months : 0,
    description: line.kind === "subscription" ? invoiceDescription(line.name, line.months) : line.name,
    kind: line.kind, quantity: line.kind === "subscription" ? 1 : line.quantity,
    unitPriceCents: line.kind === "subscription" ? line.amountCents : line.unitPriceCents,
    amountCents, ...invoiceLineAmounts(amountCents, inclusive) };
}
export function previewSubscriptionQuote(input: SubscriptionQuoteDraft, id: string, now = new Date()): SubscriptionQuote {
  const draft = subscriptionQuoteDraftSchema.parse(input), lines = draft.lines.map(line => quoteLineAmounts(line, draft.taxInclusive));
  return { id, number: "معاينة عرض سعر", issuedAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: draft.validUntil,
    seller: INVOICE_SELLER, customer: draft.customer, taxInclusive: draft.taxInclusive, taxRate: 15, lines,
    netCents: lines.reduce((sum, line) => sum + line.netCents, 0), taxCents: lines.reduce((sum, line) => sum + line.taxCents, 0), totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    templateVersion: 1, documentKind: "quote", scopeWork: draft.scopeWork, revision: 0, convertedInvoiceId: null, draft };
}
