"use server";

import { getOwnerLoyaltyActivity } from "@/lib/data/loyalty-activity";
import type { LoyaltyActivityFilters, LoyaltyActivityResult } from "@/lib/loyalty/activity-types";

export async function loadLoyaltyActivityAction(filters: LoyaltyActivityFilters): Promise<LoyaltyActivityResult> {
  try {
    return { ok: true, data: await getOwnerLoyaltyActivity(filters) };
  } catch {
    return { ok: false, message: "تعذر تحميل سجل العمليات. تحقق من الفترة المحددة وصلاحية دخولك، ثم أعد المحاولة." };
  }
}
