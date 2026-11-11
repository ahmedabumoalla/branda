import { z } from "zod";
export const customerCreditStateSchema = z.object({
  balance: z.number().finite().nonnegative(),
  entries: z.array(z.object({ id: z.uuid(), kind: z.enum(["receive", "refund", "apply", "unapply"]), amount: z.number().finite(), createdAt: z.string(), documentId: z.uuid().nullable(), note: z.string() })),
  applications: z.array(z.object({ paymentId: z.uuid(), documentId: z.uuid(), invoiceNumber: z.number().optional(), displayNumber: z.string().optional(), amount: z.number().finite(), reversible: z.boolean() })),
});
export type CustomerCreditState = z.infer<typeof customerCreditStateSchema>;
export const invoiceExtensionsStateSchema = z.object({
  statusId: z.string().nullable(), revision: z.number().int().nonnegative(),
  profit: z.object({ revenue: z.number().finite(), cost: z.number().finite().nullable(), profit: z.number().finite().nullable(), costKnown: z.boolean() }).nullable(),
  debitNotes: z.array(z.object({ id: z.uuid(), number: z.union([z.string(), z.number()]), displayNumber: z.string().optional(), total: z.number().finite() })), sourceId: z.uuid().nullable(),
});
export type InvoiceExtensionsState = z.infer<typeof invoiceExtensionsStateSchema>;
