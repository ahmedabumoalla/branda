"use server";

import { getAdminBrandAnalytics } from "@/lib/data/brand-analytics";
import type { BrandAnalyticsInput } from "@/lib/analytics/brand-analytics";

export async function loadBrandAnalyticsAction(input: BrandAnalyticsInput) {
  try { return { ok: true as const, data: await getAdminBrandAnalytics(input) }; }
  catch { return { ok: false as const, message: "تعذر تحميل الإحصاءات. تحقق من صلاحية دخولك وتفعيل سجل الإحصاءات، ثم أعد المحاولة." }; }
}
