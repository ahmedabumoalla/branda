"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import type { PointsProgram } from "@/lib/loyalty/points-program";
import { createClient } from "@/lib/supabase/server";

const programSchema = z.object({
  mode: z.enum(["stamps", "points"]),
  rateSar: z.number().min(0.01).max(1_000_000).multipleOf(0.01),
  rateQuantity: z.number().int().min(1).max(1_000_000),
  milestones: z.array(z.object({
    points: z.number().int().min(1).max(1_000_000_000),
    reward: z.string().trim().min(1).max(100),
  })).max(20),
});

export async function saveCoffeePointsProgram(input: PointsProgram, expected: PointsProgram) {
  const cafe = await requireOwnerCafeContext();
  if (cafe.staff || !featureCodesAllow(await getOwnerFeatureCodes(), "loyalty")) {
    return { ok: false as const, message: "إعدادات برنامج النقاط متاحة لمالك العلامة عند تفعيل خدمة الولاء" };
  }
  const parsed = programSchema.safeParse(input);
  const previous = programSchema.safeParse(expected);
  if (!parsed.success || !previous.success) {
    return { ok: false as const, message: "تحقق من تسعيرة النقاط وأسماء المكافآت وحدود كل مرحلة" };
  }
  const { mode, rateSar, rateQuantity, milestones } = parsed.data;
  if (mode === "points" && (!milestones.length || milestones.some((tier, i) => i > 0 && tier.points <= milestones[i - 1].points))) {
    return { ok: false as const, message: "أضف مكافأة واحدة على الأقل ورتّب المراحل من الأقل نقاطًا إلى الأعلى" };
  }
  const { error } = await (await createClient()).rpc("save_loyalty_points_program", {
    p_cafe_id: cafe.id, p_mode: mode, p_rate_sar: rateSar,
    p_rate_quantity: rateQuantity, p_milestones: milestones, p_expected: previous.data,
  });
  if (error?.code === "PGRST202" || error?.code === "42883") {
    return { ok: false as const, message: "حفظ نظام البطاقة يحتاج إلى تطبيق تحديث النقاط في قاعدة البيانات" };
  }
  if (error) return { ok: false as const, message: error.code === "40001"
    ? "تغيّرت إعدادات البرنامج من جلسة أخرى حدّث الصفحة قبل الحفظ" : "تعذر حفظ نظام البطاقة حاول مرة أخرى" };
  revalidatePath("/dashboard/loyalty");
  revalidatePath("/loyalty/[slug]", "page");
  revalidatePath("/cashier");
  return { ok: true as const, program: mode === "stamps" ? { ...previous.data, mode } : parsed.data };
}
