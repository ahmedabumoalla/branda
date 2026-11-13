'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { actionResult } from '@/lib/platform/action-result';
import { branchInput } from '@/lib/erp/branches';
import { branchRpc } from '@/lib/data/erp-branches';
import { purchasesContext, purchasesError } from '@/lib/data/erp-purchases';
import { purchaseCreditCommand, type PurchaseCreditNote } from '@/lib/erp/purchase-credit-notes';
import { invalidateFinanceViews } from '@/lib/performance/finance-route-invalidation';

export async function actPurchaseCreditNote(slug: string, input: unknown, request: string) {
  return actionResult(async () => {
    const command = purchaseCreditCommand.safeParse(branchInput(input));
    if (!command.success || !z.uuid().safeParse(request).success) throw new Error('راجع بيانات الإشعار والمبلغ والخصم والضريبة');
    const context = await purchasesContext(slug);
    const result = await branchRpc(context.client, context.cafe.id, 'erp_purchase_credit_write', {
      p_cafe: context.cafe.id, p_action: command.data.action, p_payload: command.data.payload, p_request: request,
    }, input);
    purchasesError(result.error);
    revalidatePath('/dashboard/system/purchases', 'layout');
    invalidateFinanceViews(slug);
    return result.data as { id: string; documentId: string | null; reversalId: string | null };
  }, 'تعذر حفظ الإشعار الدائن');
}
export async function refreshPurchaseCreditNotes(slug: string) {
  return actionResult(async () => {
    const context = await purchasesContext(slug);
    const result = await context.client.rpc('erp_purchase_credit_read', { p_cafe: context.cafe.id });
    purchasesError(result.error);
    return (result.data ?? []) as PurchaseCreditNote[];
  }, 'تعذر تحميل الإشعارات الدائنة');
}
