'use server';
import { z } from 'zod';
import { actionResult } from '@/lib/platform/action-result';
import { getBrandFinanceContext } from '@/lib/data/brand-finance';
import { franchiseInput, type FranchiseRegister, type FranchiseOption, type FranchiseStatement } from '@/lib/aldeem/franchise';

async function context() {
  const ctx = await getBrandFinanceContext('khayal-aldeem');
  if (ctx.cafe.role !== 'owner' || ctx.cafe.slug !== 'khayal-aldeem') throw new Error('هذه المساحة متاحة لمالك حساب الديم');
  return ctx;
}
function fail(error: { message?: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new Error('تغير السجل أعد تحميله قبل الحفظ');
  if (error.code === '23505') throw new Error('هذا الحساب أو المنتج مرتبط بالشريك مسبقًا');
  throw new Error(error.message && /[\u0600-\u06ff]/.test(error.message) && error.message.length < 350 ? error.message : 'تعذر تأكيد بيانات الفرنشايز');
}
const lookup = z.object({ mode: z.enum(['partner', 'product', 'agreement', 'customers', 'products', 'partners', 'statement']), query: z.string().trim().max(100).default(''), offset: z.number().int().min(0).max(100000).default(0), partnerId: z.uuid().nullable().default(null) });
export async function readAldeemFranchise(input: z.input<typeof lookup>) {
  return actionResult(async () => {
    const data = lookup.parse(input), ctx = await context();
    const result = await ctx.client.rpc('aldeem_franchise_read', { p_cafe: ctx.cafe.id, p_mode: data.mode, p_query: data.query, p_offset: data.offset, p_partner: data.partnerId });
    fail(result.error);
    return result.data as FranchiseRegister | FranchiseOption[] | FranchiseStatement;
  }, 'تعذر تحميل الفرنشايز');
}
export async function saveAldeemFranchise(input: unknown) {
  return actionResult(async () => {
    const parsed = franchiseInput.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues.find(issue => /[\u0600-\u06ff]/.test(issue.message))?.message ?? 'راجع بيانات السجل المطلوبة');
    const ctx = await context();
    const result = await ctx.client.rpc('aldeem_franchise_write', { p_cafe: ctx.cafe.id, p_payload: parsed.data });
    fail(result.error); return result.data as FranchiseRecordResult;
  }, 'تعذر حفظ سجل الفرنشايز');
}
type FranchiseRecordResult = { id: string; revision: number };
export async function settleAldeemFranchise(input: unknown) {
  return actionResult(async () => {
    const payload = z.object({ partnerId: z.uuid(), documentId: z.uuid(), accountId: z.uuid(), amount: z.number().finite().positive().max(100000000), note: z.string().trim().max(800), requestId: z.uuid() }).strict().parse(input);
    if (Math.round(payload.amount * 100) !== payload.amount * 100 && Math.abs(Math.round(payload.amount * 100) - payload.amount * 100) > 0.000001) throw new Error('حدد المبلغ بخانتين عشريتين');
    const ctx = await context();
    const result = await ctx.client.rpc('aldeem_franchise_settle', { p_cafe: ctx.cafe.id, p_payload: payload });
    fail(result.error); return result.data as { id: string; number: number };
  }, 'تعذر تسجيل الدفعة');
}
