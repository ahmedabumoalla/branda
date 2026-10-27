import { z } from "zod";

const amount = z.number().finite().nonnegative().max(99_999_999_999_999.99);

/** A customer-safe projection of a posted invoice, not the internal finance document. */
export const financeCustomerReceiptSchema = z.object({
  brandName: z.string().trim().min(1).max(300),
  number: z.number().int().positive().safe(),
  createdAt: z.string().datetime({ offset: true }),
  localReference: z.string().max(160).nullable(),
  subtotal: amount,
  discount: amount,
  tax: amount,
  total: amount,
  paid: amount,
  vatRate: z.number().finite().min(0).max(100).nullable(),
  taxInclusive: z.boolean().nullable(),
  paymentMethod: z.enum(["cash", "pos", "bank", ""]),
  lines: z.array(z.object({
    name: z.string().trim().min(1).max(500),
    quantity: z.number().finite().positive().max(999_999_999),
    unitPrice: amount,
    net: amount,
    tax: amount,
  }).strict()).min(1).max(5000),
}).strict();

export type FinanceCustomerReceipt = z.infer<typeof financeCustomerReceiptSchema>;
export type FinanceCustomerReceiptFonts = { regular: string; bold: string };
