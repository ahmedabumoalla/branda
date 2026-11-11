import { z } from "zod";
import type { InvoiceFile } from "./company-invoice-options";

export type InvoicePayment = {
  id: string; invoiceId: string; initial: boolean; number: number; revision: number;
  status: "completed" | "pending" | "deleted";
  amount: number; effectiveAmount: number; date: string;
  accountId: string; accountName: string; method: "cash" | "bank" | "pos" | "credit";
  collectorId: string; collectorName: string;
  reference: string; details: string; receiptNote: string; attachments: InvoiceFile[];
  canEdit: boolean; canChangeFinancials: boolean; canDelete: boolean; blockedReason: string | null;
};

export const paymentEditSchema = z.object({
  amount: z.number().finite().min(0.01).max(1_000_000_000).multipleOf(0.01),
  date: z.iso.date(), accountId: z.uuid(), status: z.enum(["completed", "pending"]),
  collectorId: z.uuid(), reference: z.string().max(160), details: z.string().max(1000),
  receiptNote: z.string().max(500), attachments: z.array(z.uuid()).max(20),
}).strict();
const identity = { invoiceId: z.uuid(), paymentId: z.uuid(), revision: z.number().int().nonnegative(), requestId: z.uuid() };
export const paymentManagementSchema = z.discriminatedUnion("action", [
  z.object({ ...identity, action: z.literal("save"), payload: paymentEditSchema }).strict(),
  z.object({ ...identity, action: z.literal("delete"), reason: z.string().trim().min(3).max(500) }).strict(),
]);
export type PaymentEditPayload = z.infer<typeof paymentEditSchema>;
export type PaymentManagementInput = z.infer<typeof paymentManagementSchema>;

