import { z } from 'zod';

export const franchiseKind = z.enum(['partner', 'product', 'agreement']);
export type FranchiseKind = z.infer<typeof franchiseKind>;
export const franchiseInput = z.object({
  id: z.uuid(), revision: z.number().int().min(0), requestId: z.uuid(), kind: franchiseKind,
  name: z.string().trim().min(2).max(160), active: z.boolean(),
  partnerId: z.uuid().nullable(), partyId: z.uuid().nullable(), productId: z.uuid().nullable(),
  payload: z.object({ reference: z.string().trim().max(100), territory: z.string().trim().max(300), from: z.union([z.iso.date(), z.literal('')]), to: z.union([z.iso.date(), z.literal('')]), royalty: z.number().finite().min(0).max(100), price: z.number().finite().min(0).max(1000000), note: z.string().trim().max(2000) }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'partner' ? !value.partyId || !!value.partnerId || !!value.productId : !value.partnerId || !!value.partyId) ctx.addIssue({ code: 'custom', message: 'اختر حساب العميل للشريك أو الشريك للسجل' });
  if (value.kind === 'product' && !value.productId) ctx.addIssue({ code: 'custom', message: 'اختر منتج المنيو' });
  if (value.kind === 'agreement' && (!value.payload.reference || !value.payload.from || !value.payload.to || value.payload.to < value.payload.from)) ctx.addIssue({ code: 'custom', message: 'أكمل رقم الاتفاقية وتواريخها الصحيحة' });
});
export type FranchiseInput = z.infer<typeof franchiseInput>;
export type FranchiseRecord = { id: string; kind: FranchiseKind; name: string; active: boolean; revision: number; partner_id: string | null; party_id: string | null; product_id: string | null; payload: FranchiseInput['payload']; partner_name?: string; party_name?: string; product_name?: string; updated_at: string };
export type FranchiseOption = { id: string; name: string; phone?: string };
export type FranchiseRegister = { rows: FranchiseRecord[]; hasMore: boolean };
export type FranchiseStatement = { partner: FranchiseRecord; invoices: { id: string; number: number; total: number; paid: number; outstanding: number; created_at: string }[]; history: { id: string; number: number; kind: string; total: number; note: string; created_at: string }[]; accounts: { id: string; name: string; kind: string }[]; hasMore: boolean };
export const FRANCHISE_SECTIONS: Record<string, { title: string; kind: FranchiseKind | 'settlement' }> = {
  'franchise-partners': { title: 'شركاء الفرنشايز', kind: 'partner' },
  'franchise-products': { title: 'منتجات الفرنشايز', kind: 'product' },
  'franchise-agreements': { title: 'اتفاقيات الفرنشايز', kind: 'agreement' },
  'franchise-settlements': { title: 'تسويات الفرنشايز', kind: 'settlement' },
};
