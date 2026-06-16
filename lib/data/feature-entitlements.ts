import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin, requireOwnerCafeContext } from "@/lib/data/cafes";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

function normalizeFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

export async function getCafeFeatureCodes(cafeId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("plan_id, platform_plans(features)")
    .eq("cafe_id", cafeId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const plan = data?.platform_plans as { features?: unknown } | null | undefined;
  const features = normalizeFeatures(plan?.features);
  return Array.from(new Set(["home", ...features, "subscription", "settings"]));
}

export async function getOwnerFeatureCodes() {
  const cafe = await requireOwnerCafeContext();
  return getCafeFeatureCodes(cafe.id);
}

export async function getPublicCafeFeatureCodesBySlug(slug: string) {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return [];
  return getCafeFeatureCodes(String(cafe.id));
}

export function filterPublicCafePayloadByFeatures<T extends Record<string, unknown>>(payload: T, features: string[]): T {
  const next = { ...payload } as Record<string, unknown>;
  if (!featureCodesAllow(features, "menu")) {
    next.products = [];
    next.categories = [];
  }
  if (!featureCodesAllow(features, "offers")) next.offers = [];
  if (!featureCodesAllow(features, "branches")) next.branches = [];
  if (!featureCodesAllow(features, "reservations")) next.reservationServices = [];
  if (!featureCodesAllow(features, "loyalty")) {
    next.loyaltySettings = { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] };
    next.loyaltyRewards = [];
  }
  if (!featureCodesAllow(features, "pages")) next.pages = [];
  return next as T;
}
