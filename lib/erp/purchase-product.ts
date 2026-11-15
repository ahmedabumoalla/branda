import { z } from 'zod';
import type { FinanceItem } from '@/lib/finance/brand-finance';

const text = (max: number) => z.string().trim().max(max).default('');
const money = z.number().finite().min(0).max(99999999).default(0);
export const purchaseProductSchema = z.object({
  name: text(150), category: text(150), brand: text(150), seller: text(150),
  sellerKind: z.enum(['supplier', 'family']).default('supplier'), flavor: text(100),
  barcode: text(64).refine(v => !v || /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(v), 'الباركود يقبل الأرقام والحروف الإنجليزية'),
  unitId: z.union([z.uuid(), z.literal('')]).default(''),
  trackStock: z.boolean().default(false), minQuantity: z.number().finite().min(0).max(1000000).default(0),
  buyPrice: money, salePrice: money, margin: money,
  marginType: z.enum(['amount', 'percent']).default('percent'),
  components: z.array(z.object({ itemId: z.uuid(), quantity: z.number().finite().positive().max(1000000).refine(v => Math.abs(v * 1000 - Math.round(v * 1000)) < .00001, 'استخدم ثلاث منازل عشرية للكمية') })).max(100).default([]),
  imagePath: z.string().max(150).nullable().default(null),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.components.map(c => c.itemId)).size !== v.components.length) ctx.addIssue({ code: 'custom', path: ['components'], message: 'لا تكرر المكون داخل المنتج' });
});
export type PurchaseProductInput = z.infer<typeof purchaseProductSchema>;
export type PurchaseProductSaved = { item: FinanceItem; buyPrice: number; salePrice: number; unit: { id: string; name: string }; productId: string | null };
export function saleFromMargin(buy: number, margin: number, type: 'amount' | 'percent') {
  return Math.round((buy + (type === 'percent' ? buy * margin / 100 : margin)) * 100) / 100;
}
export function marginFromSale(buy: number, sale: number, type: 'amount' | 'percent') {
  return Math.max(0, Math.round((type === 'percent' ? buy > 0 ? (sale - buy) / buy * 100 : 0 : sale - buy) * 100) / 100);
}
/** EAN-13 internal-use prefix, with a real check digit; uniqueness is enforced on save */
export function productBarcode(random: Uint32Array = crypto.getRandomValues(new Uint32Array(3))) {
  const body = `20${Array.from(random, n => String(n).padStart(10, '0')).join('').slice(0, 10)}`;
  const check = (10 - [...body].reduce((sum, n, i) => sum + Number(n) * (i % 2 ? 3 : 1), 0) % 10) % 10;
  return `${body}${check}`;
}
