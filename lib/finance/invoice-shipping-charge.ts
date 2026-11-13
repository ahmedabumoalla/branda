import { z } from "zod";

const revision = z.number().int().min(0).max(2_147_483_647);
const amount = z.number().finite().min(0).max(10_000_000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "المبلغ يقبل منزلتين عشريتين");
export const shippingChargeSelectionSchema = z.object({
  optionId: z.uuid().nullable(), name: z.string().trim().min(1).max(160), amount, taxRate: z.literal(15).nullable(),
}).strict();
export const shippingChargeSnapshotSchema = shippingChargeSelectionSchema.extend({
  tax: z.number().nonnegative(), total: z.number().nonnegative(), currency: z.string().length(3), exchangeRate: z.number().positive(),
  accountId: z.uuid(), lineId: z.uuid().nullable(), sar: z.object({ amount: z.number().nonnegative(), tax: z.number().nonnegative(), total: z.number().nonnegative() }).strict(),
}).strict();
export const invoiceShippingChargeContextSchema = z.object({
  enabled: z.boolean(), settingsRevision: revision, codServiceId: z.uuid().nullable(),
  options: z.array(z.object({ id: z.uuid(), name: z.string().min(1).max(160), fee: amount, taxRate: z.literal(15).nullable(), revision: revision.min(1) }).strict()),
  selection: shippingChargeSelectionSchema.nullable(), revision, hasSelection: z.boolean(), issued: z.boolean(),
}).strict();
export const invoiceShippingChargeInputSchema = z.object({
  draftId: z.uuid(), draftRevision: revision.min(1), revision, settingsRevision: revision, optionRevision: revision.min(1).nullable(), selection: shippingChargeSelectionSchema.nullable(),
}).strict();
export const invoiceShippingChargeSavedSchema = z.object({ revision, selection: shippingChargeSelectionSchema.nullable(), issued: z.boolean() }).strict();
export const issuedShippingChargeSchema = z.object({ recorded: z.boolean(), charge: shippingChargeSnapshotSchema.nullable() }).strict();
export type ShippingChargeSelection = z.infer<typeof shippingChargeSelectionSchema>;
export type ShippingChargeSnapshot = z.infer<typeof shippingChargeSnapshotSchema>;
export type InvoiceShippingChargeContext = z.infer<typeof invoiceShippingChargeContextSchema>;
export type InvoiceShippingChargeInput = z.infer<typeof invoiceShippingChargeInputSchema>;
