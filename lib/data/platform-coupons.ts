import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { couponDateBoundary } from "@/lib/platform/coupon-status";

export type PlatformDiscountCoupon = {
  id: string;
  code: string;
  title: string;
  discountPercent: number;
  eligiblePlanIds: string[];
  eligibleDurationMonths?: number[];
  validFrom?: string;
  validUntil?: string;
  maxRedemptions?: number;
  redeemedCount: number;
  active: boolean;
  createdAt: string;
};

const couponSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  title: z.string().trim().min(2).max(120),
  discountPercent: z.number().positive().max(100),
  eligiblePlanIds: z.array(z.string()).max(50).default([]),
  eligibleDurationMonths: z.array(z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)])).min(1).max(4).default([1, 3, 6, 12]),
  validFrom: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  maxRedemptions: z.number().int().positive().optional().nullable(),
  active: z.boolean(),
});

function mapCoupon(row: Record<string, unknown>): PlatformDiscountCoupon {
  return {
    id: String(row.id),
    code: String(row.code ?? ""),
    title: String(row.title ?? row.code ?? ""),
    discountPercent: Number(row.discount_percent ?? 0),
    eligiblePlanIds: Array.isArray(row.eligible_plan_ids) ? (row.eligible_plan_ids as string[]) : [],
    eligibleDurationMonths: Array.isArray(row.eligible_duration_months) ? row.eligible_duration_months.map(Number) : [1, 3, 6, 12],
    validFrom: row.valid_from ? String(row.valid_from) : undefined,
    validUntil: row.valid_until ? String(row.valid_until) : undefined,
    maxRedemptions: row.max_redemptions == null ? undefined : Number(row.max_redemptions),
    redeemedCount: Number(row.redeemed_count ?? 0),
    active: Boolean(row.active),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function getPlatformDiscountCoupons(): Promise<PlatformDiscountCoupon[]> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_discount_coupons")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapCoupon(row as Record<string, unknown>));
}

export async function savePlatformDiscountCoupon(input: Omit<PlatformDiscountCoupon, "createdAt" | "redeemedCount">) {
  await requirePlatformAdmin();
  const result = couponSchema.safeParse(input);
  if (!result.success) throw new Error("راجع اسم الكوبون والكود ونسبة الخصم وحد الاستخدام");
  const parsed = result.data;
  const validFrom = couponDateBoundary(parsed.validFrom);
  const validUntil = couponDateBoundary(parsed.validUntil, true);
  if (!validUntil) throw new Error("حدد تاريخ انتهاء الكوبون التسويقي");
  if (validFrom && validUntil <= validFrom) throw new Error("تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية");
  const admin = createAdminClient();
  const payload = {
    id: parsed.id,
    code: parsed.code,
    title: parsed.title,
    discount_percent: parsed.discountPercent,
    eligible_plan_ids: parsed.eligiblePlanIds,
    eligible_duration_months: [...new Set(parsed.eligibleDurationMonths)],
    valid_from: validFrom,
    valid_until: validUntil,
    max_redemptions: parsed.maxRedemptions || null,
    active: parsed.active,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("platform_discount_coupons")
    .upsert(payload, { onConflict: "id" });
  if (error) throw new Error(error.code === "23505" ? "كود الكوبون مستخدم اختر كودًا آخر" : "تعذر حفظ الكوبون حاول مجددًا");
}

export async function deletePlatformDiscountCoupon(couponId: string) {
  await requirePlatformAdmin();
  if (!z.string().uuid().safeParse(couponId).success) throw new Error("كوبون غير صالح");
  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_discount_coupons")
    .delete()
    .eq("id", couponId);
  if (error) throw new Error(error.code === "23503" ? "الكوبون مرتبط بطلبات اشتراك يمكنك إيقافه من التعديل للحفاظ على السجل" : "تعذر حذف الكوبون حاول مجددًا");
}
