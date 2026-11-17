import { z } from "zod";
import type { FinanceAccount, FinanceRefundRequest, FinanceShift } from "./brand-finance";

export const aldeemReturnInvoiceSchema = z.object({
  id: z.uuid(), number: z.number().int().positive(), displayNumber: z.string().optional(),
  customerName: z.string(), createdAt: z.string(), total: z.number().finite().nonnegative(),
});
export type AldeemReturnInvoice = z.infer<typeof aldeemReturnInvoiceSchema>;
export type AldeemRefundRequest = FinanceRefundRequest & { accountName?: string };
export type AldeemReturnSettlement = { accounts: FinanceAccount[]; shifts: FinanceShift[] };

export const aldeemReturnInvoicesSchema = z.object({ items: z.array(aldeemReturnInvoiceSchema).max(30), hasMore: z.boolean() });
export const aldeemRefundRequestsSchema = z.array(z.object({
  id: z.uuid(), document_id: z.uuid(), document_number: z.number().int().positive(),
  status: z.enum(["pending", "approved", "rejected"]),
  payload: z.object({
    lines: z.array(z.object({ lineId: z.uuid(), quantity: z.number().finite().positive(), name: z.string().optional() }).passthrough()).min(1).max(100),
    accountId: z.uuid().nullish().transform(value => value ?? undefined), shiftId: z.uuid().nullish().transform(value => value ?? undefined),
    paymentMethod: z.string().nullish().transform(value => value ?? undefined), deferStock: z.boolean().optional(), note: z.string(),
  }).passthrough(),
  total: z.number().finite().nonnegative(), paid: z.number().finite().nonnegative(),
  created_by: z.uuid(), created_at: z.string(), reviewed_by: z.uuid().nullable().optional(), reviewed_at: z.string().nullable().optional(),
  refund_document_id: z.uuid().nullable().optional(), rejection_reason: z.string().nullable().optional(), accountName: z.string().optional(),
})).max(100);
export const aldeemReturnSettlementSchema = z.object({
  accounts: z.array(z.object({
    id: z.uuid(), name: z.string(), code: z.string(), kind: z.enum(["cash", "bank"]), balance: z.number().finite(),
    active: z.boolean(), is_primary: z.boolean(), is_cashier_drawer: z.boolean(),
  })),
  shifts: z.array(z.object({
    id: z.uuid(), shift_number: z.number().int(), user_id: z.uuid(), account_id: z.uuid(), status: z.literal("open"),
    opening_cash: z.number().finite(), expected_cash: z.number().finite(), counted_cash: z.number().finite().nullable(),
    variance: z.number().finite().nullable(), opened_at: z.string(), closed_at: z.string().nullable(), handover_to: z.uuid().nullable(),
    note: z.string(), supervisor_paused: z.boolean(),
  })),
});
