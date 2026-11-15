import { z } from "zod";

// Loyalty points: one balance per customer phone across all branches, spent as a discount on a cashier sale.
export const pointsSettingsSchema = z.object({
  revision: z.number().int().min(0), enabled: z.boolean(),
  earnPerRiyal: z.number().min(.01, "نقاط كل ريال يجب أن تكون 0.01 على الأقل").max(100, "نقاط كل ريال لا تتجاوز 100"),
  minInvoice: z.number().min(0).max(100000),
  pointValue: z.number().min(.001, "قيمة النقطة يجب أن تكون 0.001 ريال على الأقل").max(100),
  minRedeemPoints: z.number().int("الحد الأدنى للاستبدال عدد صحيح").min(1).max(1000000),
  maxRedeemPercent: z.number().min(1, "أقصى نسبة دفع بالنقاط من 1 إلى 95").max(95, "أقصى نسبة دفع بالنقاط من 1 إلى 95"),
  expiryDays: z.number().int("مدة الصلاحية عدد صحيح من الأيام").min(0).max(3650),
});
export type PointsSettings = z.infer<typeof pointsSettingsSchema>;
export const pointsAdjustSchema = z.object({
  phone: z.string().trim().min(9).max(25), points: z.number().int().refine(value => value !== 0 && Math.abs(value) <= 1000000, "عدد النقاط يجب ألا يكون صفرًا"),
  note: z.string().trim().min(5, "اكتب سبب التعديل بوضوح").max(500), branchId: z.uuid().nullable().optional(),
});

export type PointsBalance = { enabled: boolean; balance: number; phone?: string; value?: number; pointValue?: number; minRedeemPoints?: number; maxRedeemPercent?: number };
export type PointsEntry = {
  id: string; phone: string; kind: "earn" | "redeem" | "reverse" | "adjust"; points: number; branchId: string | null; amount: number; note: string;
  createdAt: string; expiresAt: string | null; documentNumber: number | null; documentKind: string | null; documentId: string | null; actor: string;
};
export type PointsSnapshot = {
  role: string; canManage: boolean; slug: string; brand: string; settings: PointsSettings;
  branches: { id: string; name: string }[];
  totals: { earned: number; redeemed: number; redeemedValue: number; customers: number; outstanding: number };
  byBranch: { branchId: string | null; earned: number; redeemed: number }[];
  customers: { phone: string; name: string; balance: number; earned: number; redeemed: number; lastAt: string }[];
  customer: { phone: string; balance: number } | null; ledger: PointsEntry[];
};
export const pointsKindLabels = { earn: "اكتساب", redeem: "استبدال", reverse: "تسوية مرتجع", adjust: "تعديل إداري" } as const;
export const localPhone = (phone: string) => phone.startsWith("966") ? `0${phone.slice(3)}` : phone;

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const pointsDiscount = (points: number, info: PointsBalance) => info.enabled && points > 0 ? round(points * (info.pointValue ?? 0)) : 0;
/** Why the requested points cannot be spent on this sale, or an empty string when they can */
export function pointsIssue(points: number, info: PointsBalance, subtotal: number) {
  if (!points) return "";
  if (!info.enabled) return "نقاط الولاء غير مفعلة";
  if (!Number.isInteger(points) || points < 0) return "عدد النقاط يجب أن يكون عددًا صحيحًا";
  if (points > info.balance) return "عدد النقاط أكبر من رصيد العميل";
  if (points < (info.minRedeemPoints ?? 1)) return `الحد الأدنى للاستبدال ${info.minRedeemPoints} نقطة`;
  const value = pointsDiscount(points, info);
  if (value > round(subtotal * (info.maxRedeemPercent ?? 0) / 100)) return `أقصى ما يدفع بالنقاط ${info.maxRedeemPercent}% من قيمة الفاتورة`;
  if (value >= subtotal) return "قيمة النقاط يجب أن تكون أقل من قيمة الفاتورة";
  return "";
}
