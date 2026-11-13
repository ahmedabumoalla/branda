'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getBrandFinanceContext } from '@/lib/data/brand-finance';
import { customerErpError } from '@/lib/data/erp-customers';
import { branchRpc } from '@/lib/data/erp-branches';
import { branchInput } from '@/lib/erp/branches';
import { customerFormsCommand, type CustomerFormsSnapshot } from '@/lib/erp/customer-forms';
import { actionResult } from '@/lib/platform/action-result';

export async function getCustomerForms(slug: string, recordId?: string) {
  return actionResult(async () => {
    if (recordId) z.uuid().parse(recordId);
    const { client, cafe } = await getBrandFinanceContext(slug);
    const result = await client.rpc('erp_customer_forms_read', { p_cafe: cafe.id, p_kind: 'customers', p_record: recordId ?? null });
    customerErpError(result.error);
    if (!result.data || !Array.isArray(result.data.models) || !Array.isArray(result.data.entries) || !Array.isArray(result.data.events) || !result.data.branchScope) throw new Error('استجابة نماذج العملاء غير مكتملة');
    return result.data as CustomerFormsSnapshot;
  }, 'تعذر تحميل نماذج العملاء');
}
export async function saveCustomerForm(input: unknown, requestId: string, slug?: string) {
  return actionResult(async () => {
    const parsed = customerFormsCommand.safeParse(branchInput(input));
    if (!parsed.success) throw new Error('راجع بيانات النموذج والحقول والصلاحيات');
    z.uuid().parse(requestId);
    const command = parsed.data;
    const { client, cafe } = await getBrandFinanceContext(slug);
    const result = await branchRpc(client, cafe.id, 'erp_customer_forms_write', { p_cafe: cafe.id, p_action: command.action, p_input: command.payload, p_request: requestId }, input);
    customerErpError(result.error);
    revalidatePath('/dashboard/system/customers', 'layout');
    if (slug) revalidatePath(`/finance/${slug}/system/customers`, 'layout');
    return result.data as { id: string; revision?: number };
  }, 'تعذر حفظ نموذج العميل');
}
