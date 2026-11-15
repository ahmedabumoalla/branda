import { z } from "zod";

export const SAUDI_EINVOICE_APP = "saudi_einvoice";

export const saudiEinvoicePolicySchema = z.object({
  available: z.boolean(),
  enabled: z.boolean(),
  source: z.enum(["explicit", "tax_profile"]),
  appsRevision: z.number().int().nonnegative(),
  message: z.string().optional(),
});
export type SaudiEinvoicePolicy = z.infer<typeof saudiEinvoicePolicySchema>;

export function unavailableSaudiEinvoicePolicy(): SaudiEinvoicePolicy {
  return {
    available: false,
    enabled: true,
    source: "tax_profile",
    appsRevision: 0,
    message: "إعداد الفوترة الإلكترونية غير متاح حتى اكتمال تحديث قاعدة البيانات",
  };
}

export const invoiceAmendmentLineSchema = z.object({
  id: z.uuid().nullable(),
  productId: z.uuid(),
  name: z.string(),
  quantity: z.number().finite().positive().max(9999).multipleOf(0.001),
  price: z.number().finite().nonnegative().max(10_000_000).multipleOf(0.000001),
  description: z.string().max(500),
  unitLabel: z.string(),
  unitFactor: z.number().finite().positive(),
});
export type InvoiceAmendmentLine = z.infer<typeof invoiceAmendmentLineSchema>;

export const invoiceAmendmentContextSchema = z.object({
  available: z.boolean(),
  canAmend: z.boolean(),
  code: z.string(),
  message: z.string(),
  invoiceId: z.uuid(),
  revision: z.number().int().nonnegative(),
  saudiEinvoice: saudiEinvoicePolicySchema,
  lines: z.array(invoiceAmendmentLineSchema),
  note: z.string(),
  currentTotal: z.number().finite().nonnegative(),
  currentPaid: z.number().finite().nonnegative(),
  discount: z.number().finite().nonnegative(),
  taxRate: z.number().finite().nonnegative(),
  taxInclusive: z.boolean(),
});
export type InvoiceAmendmentContext = z.infer<typeof invoiceAmendmentContextSchema>;

export const invoiceAmendmentInputSchema = z.object({
  invoiceId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.uuid(),
  note: z.string().max(1000),
  lines: z.array(invoiceAmendmentLineSchema.pick({ id: true, productId: true, quantity: true, price: true, description: true }).strict()).min(1).max(100),
}).strict().superRefine((value, context) => {
  const ids = value.lines.flatMap(line => line.id ? [line.id] : []);
  if (new Set(ids).size !== ids.length) context.addIssue({code: "custom", path: ["lines"], message: "لا تكرر بند الفاتورة"});
});
export type InvoiceAmendmentInput = z.infer<typeof invoiceAmendmentInputSchema>;

export function unavailableInvoiceAmendmentContext(invoiceId: string): InvoiceAmendmentContext {
  return {
    available: false, canAmend: false, code: "unavailable",
    message: "تعديل بنود الفاتورة غير متاح حتى اكتمال تحديث قاعدة البيانات",
    invoiceId, revision: 0, saudiEinvoice: unavailableSaudiEinvoicePolicy(), lines: [], note: "",
    currentTotal: 0, currentPaid: 0, discount: 0, taxRate: 0, taxInclusive: false,
  };
}
