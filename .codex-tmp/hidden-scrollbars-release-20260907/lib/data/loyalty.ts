import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import type { LoyaltyReward, LoyaltySettings } from "@/lib/mock/loyalty";

const defaultSettings: LoyaltySettings = {
  pointsPerSar: 1,
  welcomePoints: 25,
  enabled: true,
  earnRules: [],
  redemptionRules: [],
};

function mapDbLoyaltyRules(row: Record<string, unknown>): LoyaltySettings {
  return {
    pointsPerSar: Number(row.points_per_sar ?? 1),
    welcomePoints: Number(row.welcome_points ?? 0),
    enabled: Boolean(row.enabled ?? true),
    earnRules: Array.isArray(row.earn_rules) ? (row.earn_rules as LoyaltySettings["earnRules"]) : [],
    redemptionRules: Array.isArray(row.redemption_rules)
      ? (row.redemption_rules as LoyaltySettings["redemptionRules"])
      : [],
  };
}

function mapDbReward(row: Record<string, unknown>): LoyaltyReward {
  return {
    id: row.id as string,
    title: row.title as string,
    points: row.points as number,
    description: (row.description as string) ?? "",
    active: row.active as boolean,
  };
}

export async function getPublicLoyaltyBySlug(slug: string) {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return { settings: defaultSettings, rewards: [] as LoyaltyReward[] };

  const supabase = await createClient();
  const [{ data: rules }, { data: rewards }] = await Promise.all([
    supabase.from("loyalty_rules").select("*").eq("cafe_id", cafe.id).maybeSingle(),
    supabase
      .from("loyalty_rewards")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("active", true)
      .order("points"),
  ]);

  return {
    settings: rules ? mapDbLoyaltyRules(rules) : defaultSettings,
    rewards: (rewards ?? []).map(mapDbReward),
  };
}

export async function getOwnerLoyalty() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const [{ data: rules }, { data: rewards }] = await Promise.all([
    supabase.from("loyalty_rules").select("*").eq("cafe_id", cafe.id).maybeSingle(),
    supabase.from("loyalty_rewards").select("*").eq("cafe_id", cafe.id).order("points"),
  ]);

  return {
    settings: rules ? mapDbLoyaltyRules(rules) : defaultSettings,
    rewards: (rewards ?? []).map(mapDbReward),
  };
}

const loyaltySettingsSchema = z.object({
  enabled: z.boolean(),
  pointsPerSar: z.number(),
  welcomePoints: z.number().int(),
  earnRules: z.array(z.unknown()),
  redemptionRules: z.array(z.unknown()),
});

export async function saveLoyaltySettings(input: z.infer<typeof loyaltySettingsSchema>) {
  const parsed = loyaltySettingsSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { error } = await supabase.from("loyalty_rules").upsert(
    {
      cafe_id: cafe.id,
      enabled: parsed.enabled,
      points_per_sar: parsed.pointsPerSar,
      welcome_points: parsed.welcomePoints,
      earn_rules: parsed.earnRules,
      redemption_rules: parsed.redemptionRules,
    },
    { onConflict: "cafe_id" }
  );
  if (error) throw error;
}

const rewardSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  points: z.number().int().positive(),
  description: z.string().optional(),
  active: z.boolean(),
});

export async function upsertLoyaltyReward(input: z.infer<typeof rewardSchema>) {
  const parsed = rewardSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    title: parsed.title,
    points: parsed.points,
    description: parsed.description ?? null,
    active: parsed.active,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("loyalty_rewards")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapDbReward(data);
  }

  const { data, error } = await supabase.from("loyalty_rewards").insert(payload).select("*").single();
  if (error) throw error;
  return mapDbReward(data);
}

export async function deleteLoyaltyReward(rewardId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("loyalty_rewards")
    .delete()
    .eq("id", rewardId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
}
