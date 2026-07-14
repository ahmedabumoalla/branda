import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicCafeBySlugAdmin, requireOwnerCafeContext } from "@/lib/data/cafes";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import {
  getEffectiveBrandFeatureCodes,
  type BrandFeatureOverride,
} from "@/lib/platform/feature-access";
import { getPlatformFeatureDefinition, type PlatformFeatureId } from "@/lib/platform/feature-registry";

const PUBLIC_GAMES_FEATURE_KEY = "in_store_table_wars";
const BATTLE_ARENA_GAME_KEY = "battle_arena";

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
  const [subscriptionResult, overridesResult] = await Promise.all([
    admin
      .from("subscriptions")
      .select("plan_id, platform_plans(features)")
      .eq("cafe_id", cafeId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("brand_feature_overrides")
      .select("feature_id, enabled")
      .eq("cafe_id", cafeId),
  ]);

  const { data, error } = subscriptionResult;
  if (error) throw error;
  if (overridesResult.error) throw overridesResult.error;

  const plan = data?.platform_plans as { features?: unknown } | null | undefined;
  const features = normalizeFeatures(plan?.features);
  const overrides = ((overridesResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
    featureId: String(row.feature_id) as PlatformFeatureId,
    enabled: Boolean(row.enabled),
  })) satisfies BrandFeatureOverride[];
  const effectiveFeatures = getEffectiveBrandFeatureCodes(features, overrides);
  return Array.from(new Set(["home", ...effectiveFeatures, "subscription", "settings"]));
}

export async function hasBrandFeature(brandId: string, featureKey: string): Promise<boolean> {
  if (!brandId || !getPlatformFeatureDefinition(featureKey)) return false;
  const features = await getCafeFeatureCodes(brandId);
  return featureCodesAllow(features, featureKey);
}

export async function getOwnerFeatureCodes() {
  const cafe = await requireOwnerCafeContext();
  return getCafeFeatureCodes(cafe.id);
}

export type PublicGamesVisibility = {
  packageGamesEnabled: boolean;
  tableWarsEnabled: boolean;
  battleArenaEnabled: boolean;
  hasAnyEnabledGame: boolean;
  showPublicGamesSection: boolean;
};

const unavailablePublicGames: PublicGamesVisibility = {
  packageGamesEnabled: false,
  tableWarsEnabled: false,
  battleArenaEnabled: false,
  hasAnyEnabledGame: false,
  showPublicGamesSection: false,
};

export async function getPublicGamesVisibilityForCafe(
  cafeId: string,
  featureCodes?: string[],
): Promise<PublicGamesVisibility> {
  const features = featureCodes ?? await getCafeFeatureCodes(cafeId);
  const packageGamesEnabled = featureCodesAllow(features, PUBLIC_GAMES_FEATURE_KEY);
  if (!packageGamesEnabled) return unavailablePublicGames;

  const admin = createAdminClient();
  const [battleArenaResult, tableWarsResult] = await Promise.all([
    admin
      .from("brand_feature_overrides")
      .select("enabled")
      .eq("cafe_id", cafeId)
      .eq("feature_id", BATTLE_ARENA_GAME_KEY)
      .maybeSingle(),
    admin
      .from("table_wars_tables")
      .select("id", { count: "exact", head: true })
      .eq("cafe_id", cafeId)
      .eq("is_active", true),
  ]);

  const battleArenaEnabled = !battleArenaResult.error && Boolean(battleArenaResult.data?.enabled);
  const tableWarsEnabled = !tableWarsResult.error && Number(tableWarsResult.count ?? 0) > 0;
  const hasAnyEnabledGame = tableWarsEnabled || battleArenaEnabled;

  return {
    packageGamesEnabled,
    tableWarsEnabled,
    battleArenaEnabled,
    hasAnyEnabledGame,
    showPublicGamesSection: packageGamesEnabled && hasAnyEnabledGame,
  };
}

export async function getPublicGamesVisibilityBySlug(slug: string) {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return unavailablePublicGames;
  return getPublicGamesVisibilityForCafe(String(cafe.id));
}

export async function getPublicCafeFeatureCodesBySlug(slug: string) {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return [];
  const features = await getCafeFeatureCodes(String(cafe.id));
  if (!featureCodesAllow(features, PUBLIC_GAMES_FEATURE_KEY)) return features;

  const gamesVisibility = await getPublicGamesVisibilityForCafe(String(cafe.id), features);
  return gamesVisibility.showPublicGamesSection
    ? features
    : features.filter((feature) => feature !== PUBLIC_GAMES_FEATURE_KEY);
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
  if (!featureCodesAllow(features, "experience_reviews")) next.experienceCampaigns = [];
  if (!featureCodesAllow(features, "loyalty")) {
    next.loyaltySettings = { pointsPerSar: 0, welcomePoints: 0, enabled: false, earnRules: [], redemptionRules: [] };
    next.loyaltyRewards = [];
  }
  if (!featureCodesAllow(features, "pages")) next.pages = [];
  return next as T;
}
