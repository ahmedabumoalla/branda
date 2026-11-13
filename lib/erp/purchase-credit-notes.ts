import { z } from 'zod';

const identity = { id: z.uuid(), revision: z.number().int().min(0) };
const money = z.number().finite().min(0).max(1e9).multipleOf(.01);
export const purchaseCreditInput = z.object({
  ...identity, invoiceId: z.uuid(), date: z.iso.date(),
  description: z.string().trim().min(1).max(2000), amount: money.positive(),
  discount: money, taxRate: z.number().finite().min(0).max(100).multipleOf(.001), expenseAccountId: z.uuid(),
}).strict().refine(v => v.discount < v.amount, 'الخصم يجب أن يكون أقل من قيمة الإشعار');
export type PurchaseCreditInput = z.infer<typeof purchaseCreditInput>;
export const purchaseCreditCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), payload: purchaseCreditInput }),
  z.object({ action: z.literal('post'), payload: z.object({ ...identity, expectedTotal: money.positive() }).strict() }),
  z.object({ action: z.enum(['draft', 'delete', 'cancel']), payload: z.object(identity).strict() }),
  z.object({ action: z.literal('payment'), payload: z.object({ ...identity, accountId: z.uuid(), amount: money.positive(), date: z.iso.date() }).strict() }),
]);
export type PurchaseCreditCommand = z.infer<typeof purchaseCreditCommand>;
export type PurchaseCreditNote = {
  id: string; code: string; revision: number; source_document_id: string; sourceNumber: string | number;
  branch_id: string | null; supplierId: string; status: 'draft' | 'posted' | 'cancelled';
  document_id: string | null; created_at: string; outstanding: number;
  payload: Omit<PurchaseCreditInput, 'id' | 'revision' | 'invoiceId'> & { net: number; tax: number; total: number };
  history: { document_id: string; reversal_document_id: string | null; created_at: string }[];
};
export function purchaseCreditTotals(value: Pick<PurchaseCreditInput, 'amount' | 'discount' | 'taxRate'>) {
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const net = round(value.amount - value.discount), tax = round(net * value.taxRate / 100);
  return { net, tax, total: round(net + tax) };
}
