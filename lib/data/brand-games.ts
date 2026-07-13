import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { hasBrandFeature } from "@/lib/data/feature-entitlements";

const PUBLIC_GAMES_FEATURE_KEY = "in_store_table_wars";
const BATTLE_ARENA_GAME_KEY = "battle_arena";

export async function isBattleArenaEnabledForCafe(cafeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("brand_feature_overrides")
    .select("enabled")
    .eq("cafe_id", cafeId)
    .eq("feature_id", BATTLE_ARENA_GAME_KEY)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.enabled);
}

export async function getOwnerBattleArenaEnabled() {
  const cafe = await requireOwnerCafeContext();
  return isBattleArenaEnabledForCafe(cafe.id);
}

export async function setOwnerBattleArenaEnabled(enabled: boolean) {
  const cafe = await requireOwnerCafeContext();
  const gamesFeatureEnabled = await hasBrandFeature(cafe.id, PUBLIC_GAMES_FEATURE_KEY);
  if (!gamesFeatureEnabled) {
    throw new Error("ميزة ألعاب العلامة التجارية غير مفعّلة لهذه العلامة.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("brand_feature_overrides")
    .upsert(
      {
        cafe_id: cafe.id,
        feature_id: BATTLE_ARENA_GAME_KEY,
        enabled,
      },
      { onConflict: "cafe_id,feature_id" },
    );

  if (error) throw error;
  return cafe.slug;
}
