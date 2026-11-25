import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { emptyNearbySchedule, nearbyScheduleSchema, type NearbySchedule } from "@/lib/loyalty/nearby-schedule";

export async function getNearbySchedule(cafeId: string): Promise<NearbySchedule> {
  const { data, error } = await createAdminClient().from("loyalty_nearby_schedules").select("enabled,periods,revision").eq("cafe_id", cafeId).maybeSingle();
  if (error) throw new Error("تعذر تحميل فترات رسائل القرب");
  return data ? nearbyScheduleSchema.parse(data) : { ...emptyNearbySchedule };
}

export async function saveOwnerNearbySchedule(input: unknown) {
  const [cafe, features] = await Promise.all([requireOwnerCafeContext(), getOwnerFeatureCodes()]);
  if (!featureCodesAllow(features, "loyalty")) throw new Error("غير مسموح بتعديل فترات رسائل القرب لهذا الحساب");
  const parsed = nearbyScheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0].message };
  const { data, error } = await (await createClient()).rpc("save_loyalty_nearby_schedule", {
    p_cafe: cafe.id, p_enabled: parsed.data.enabled, p_periods: parsed.data.periods, p_revision: parsed.data.revision,
  });
  if (error) return { ok: false as const, message: error.code === "40001" ? "تغيرت الفترات من جلسة أخرى حدّث الصفحة قبل الحفظ" : "تعذر حفظ الفترات حاول مرة أخرى" };
  return { ok: true as const, schedule: nearbyScheduleSchema.parse(data) };
}

/** Called by the authenticated wallet worker, never by a public route. */
export async function refreshNearbySchedules() {
  const { data, error } = await createAdminClient().rpc("refresh_loyalty_nearby_schedules");
  // Allow source-first rollout without interrupting existing wallet jobs.
  if (error && ["PGRST202", "42883"].includes(error.code)) return { ready: false, changed: 0 };
  if (error) throw new Error("nearby_schedule_refresh_unavailable");
  return { ready: true, changed: Number(data ?? 0) };
}
