import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCafeFeatureCodesBySlug, getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getPublicLoyaltyProgramBySlug, getLoyaltyCardViewByCode, getCustomerLoyaltyCardViewForProfile } from "@/lib/data/loyalty-cards";
import { getVerifiedLoyaltyCustomerProfile } from "@/lib/auth/rast-loyalty-session";
import { getCashierToken } from "@/lib/data/cashier";
import { assertRastLoyaltyEntitlement } from "@/lib/data/rast-loyalty-access";
import { createBarndaksaQrPayload, parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { getCustomerRewardInstances } from "@/lib/data/customer-rewards";
import { defaultLoyaltyExperience, type LoyaltyExperienceInput } from "@/lib/loyalty/experience-types";
import { resolveBranchGoogleMapsUrl } from "@/lib/maps/resolve-branch-location";
import type { WalletMember } from "@/lib/wallet/types";

export async function getLoyaltyExperience(cafeId: string) {
  const { data, error } = await createAdminClient().from("cafe_loyalty_experience")
    .select("reward_validity_days,reward_kind,reward_discount_percent,nearby_message,branch_latitude,branch_longitude,offer_title,offer_body,offer_updated_at,updated_at").eq("cafe_id", cafeId).maybeSingle();
  if (error) throw new Error("إعدادات تجربة الولاء تحتاج إكمال تهيئة قاعدة البيانات.");
  return data ? {
    rewardValidityDays: Number(data.reward_validity_days), nearbyMessage: String(data.nearby_message),
    rewardKind: data.reward_kind as "product" | "discount" | "custom",
    rewardDiscountPercent: data.reward_discount_percent == null ? null : Number(data.reward_discount_percent),
    latitude: data.branch_latitude == null ? null : Number(data.branch_latitude),
    longitude: data.branch_longitude == null ? null : Number(data.branch_longitude),
    offerTitle: String(data.offer_title ?? ""), offerBody: String(data.offer_body ?? ""),
    offerUpdatedAt: data.offer_updated_at ? String(data.offer_updated_at) : null,
    updatedAt: String(data.updated_at),
  } : { ...defaultLoyaltyExperience };
}

export async function getLoyaltyBrand(slug: string) {
  if (slug !== "rast") return null;
  const [cafe, features, program, settings] = await Promise.all([
    getCafeBySlug(slug), getPublicCafeFeatureCodesBySlug(slug), getPublicLoyaltyProgramBySlug(slug), getPublicCafeSettings(slug),
  ]);
  if (!cafe || !program || !featureCodesAllow(features, "loyalty")) return null;
  return { cafeId: String(cafe.id), identity: { slug: String(cafe.slug), name: String(cafe.name), logoUrl: settings?.logoDataUrl ?? null }, program };
}

export async function getLoyaltyMembership(slug: string) {
  const brand = await getLoyaltyBrand(slug);
  if (!brand || !brand.program.enabled) return null;
  const profile = await getVerifiedLoyaltyCustomerProfile(slug);
  if (!profile) return null;
  const view = await getCustomerLoyaltyCardViewForProfile(slug, String(profile.id));
  if (!view) return null;
  const rewards = await getCustomerRewardInstances(slug, String(profile.id));
  const availableRewards = rewards
    .filter((reward) => reward.sourceType === "loyalty" && reward.status === "available" && (!reward.expiresAt || Date.parse(reward.expiresAt) > Date.now()))
    .map((reward) => ({ ...reward, qrPayload: createBarndaksaQrPayload("customer-reward", reward.rewardCode) }));
  return { ...view, card: { ...view.card, availableRewards: availableRewards.length }, rewards: availableRewards };
}

// Only trusted wallet webservice callers may use this privileged snapshot.
export async function loadWalletMemberByCode(cardCode: string): Promise<WalletMember | null> {
  const view = await getLoyaltyCardViewByCode(cardCode);
  if (!view || !view.program.enabled) return null;
  const brand = await getLoyaltyBrand(view.cafeSlug);
  if (!brand) return null;
  const { count, error } = await createAdminClient().from("customer_reward_instances").select("id", { count: "exact", head: true })
    .eq("cafe_id", view.card.cafeId).eq("loyalty_card_id", view.card.id).eq("status", "available")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if (error) throw new Error("تعذر تحديث مكافآت البطاقة.");
  return { ...view, card: { ...view.card, availableRewards: count ?? 0 }, logoUrl: brand.identity.logoUrl, experience: await getLoyaltyExperience(view.card.cafeId) };
}

export async function getAuthorizedWalletMember(cardCode: string) {
  const code = z.string().trim().min(4).max(100).parse(cardCode);
  const view = await getLoyaltyCardViewByCode(code);
  if (!view) return null;
  const profile = await getVerifiedLoyaltyCustomerProfile(view.cafeSlug);
  if (!profile) return null;
  const { data, error } = await createAdminClient().from("loyalty_cards").select("id")
    .eq("id", view.card.id).eq("cafe_id", view.card.cafeId).eq("customer_profile_id", profile.id).maybeSingle();
  if (error || !data) return null;
  return loadWalletMemberByCode(code);
}

const experienceSchema = z.object({
  rewardKind: z.enum(["product", "discount", "custom"]).default("custom"),
  rewardDiscountPercent: z.number().int().min(1).max(100).nullable().optional().default(null),
  rewardValidityDays: z.number().int().min(1).max(365), nearbyMessage: z.string().trim().min(2).max(240),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
}).refine((value) => (value.latitude === null) === (value.longitude === null), "أدخل إحداثيات الفرع كاملة.")
  .refine((value) => value.rewardKind !== "discount" || value.rewardDiscountPercent !== null, "حدد نسبة الخصم.");

async function parseExperienceInput(input: LoyaltyExperienceInput) {
  const mapsUrl = z.string().trim().max(2048).optional().parse(input.mapsUrl);
  const location = mapsUrl === undefined ? {} : await resolveBranchGoogleMapsUrl(mapsUrl);
  return experienceSchema.parse({ ...input, ...location });
}

export async function saveOwnerLoyaltyExperience(input: LoyaltyExperienceInput) {
  const [cafe, features] = await Promise.all([requireOwnerCafeContext(), getOwnerFeatureCodes()]);
  if (cafe.slug !== "rast") throw new Error("هذه التجربة مخصصة لراست.");
  if (!featureCodesAllow(features, "loyalty")) throw new Error("الولاء غير متاح في باقتك.");
  const parsed = await parseExperienceInput(input);
  const { error } = await (await createClient()).from("cafe_loyalty_experience").upsert({
    cafe_id: cafe.id, reward_validity_days: parsed.rewardValidityDays, nearby_message: parsed.nearbyMessage,
    reward_kind: parsed.rewardKind, reward_discount_percent: parsed.rewardKind === "discount" ? parsed.rewardDiscountPercent : null,
    branch_latitude: parsed.latitude, branch_longitude: parsed.longitude,
  }, { onConflict: "cafe_id" });
  if (error) throw new Error("تعذر حفظ إعدادات الولاء.");
}

const programSchema = z.object({
  enabled: z.boolean(), cardTitle: z.string().trim().min(2).max(80), cardSubtitle: z.string().trim().min(2).max(140),
  purchasesRequired: z.number().int().min(1).max(100), rewardProductId: z.string().uuid().nullable(),
  rewardName: z.string().trim().min(2).max(80), stampLabel: z.string().min(1).max(40), terms: z.string().max(1000),
  cardBackground: z.string().regex(/^#[a-fA-F0-9]{6}$/), cardForeground: z.string().regex(/^#[a-fA-F0-9]{6}$/), cardAccent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  cardDesign: z.unknown().optional().nullable(),
  appleWalletEnabled: z.boolean().default(false), googleWalletEnabled: z.boolean().default(false),
});

export async function saveBrandLoyaltyProgram(input: { program: z.infer<typeof programSchema>; experience: LoyaltyExperienceInput }) {
  const program = programSchema.parse(input.program);
  const [cafe, features] = await Promise.all([requireOwnerCafeContext(), getOwnerFeatureCodes()]);
  if (cafe.slug !== "rast") throw new Error("هذه التجربة مخصصة لراست.");
  if (!featureCodesAllow(features, "loyalty")) throw new Error("الولاء غير متاح في باقتك.");
  const experience = await parseExperienceInput(input.experience);
  if (experience.rewardKind === "product" && !program.rewardProductId) throw new Error("اختر منتج المكافأة.");
  const { error } = await (await createClient()).rpc("set_rast_loyalty_settings", { p_cafe_id: cafe.id, p_program: program, p_experience: experience });
  if (error) throw new Error("تعذر حفظ برنامج الولاء. إعداداتك لم تتغير.");
}

// Compatibility with the concurrent Rast editor; same validated atomic service.
export const saveRastLoyaltySettings = saveBrandLoyaltyProgram;

export async function lookupRastCashierCard(rawCode: string) {
  const input = z.string().trim().min(4).max(500).parse(rawCode);
  const code = parseBarndaksaQrPayload(input, "loyalty-card") ?? input.toUpperCase();
  if (!/^[A-Z0-9_-]{4,100}$/.test(code)) throw new Error("رمز البطاقة غير صالح.");
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الموظف منتهية.");
  const admin = createAdminClient();
  const { data: session, error } = await admin.from("cafe_cashier_sessions")
    .select("cafe_id,cafe_cashiers!cashier_sessions_cashier_same_cafe(active),cafes(slug)")
    .eq("token", token).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !session) throw new Error("جلسة الموظف منتهية.");
  const cashier = Array.isArray(session.cafe_cashiers) ? session.cafe_cashiers[0] : session.cafe_cashiers;
  const cafe = Array.isArray(session.cafes) ? session.cafes[0] : session.cafes;
  if (!cashier?.active || cafe?.slug !== "rast") throw new Error("هذه البطاقة غير متاحة لهذه الجلسة.");
  await assertRastLoyaltyEntitlement(String(session.cafe_id));
  // The database checks the card and customer, and commits the read audit together.
  const { data, error: previewError } = await admin.rpc("preview_loyalty_card", {
    p_session_token: token, p_card_code: code,
  });
  if (previewError || data?.ok !== true) throw new Error("البطاقة غير متاحة أو البرنامج موقوف.");
  return z.object({
    customerName: z.string(), stampsInCycle: z.number().int().nonnegative(),
    purchasesRequired: z.number().int().positive(), availableRewards: z.number().int().nonnegative(), rewardName: z.string(),
  }).parse(data);
}
