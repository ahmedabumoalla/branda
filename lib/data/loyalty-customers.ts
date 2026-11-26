import "server-only";
import { z } from "zod";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { createClient } from "@/lib/supabase/server";
import { FAROUJ_CAFE_ID, faroujCustomerPhone, phoneRegionName } from "@/lib/loyalty/customer-phone";
import type { LoyaltyCustomerDetail, LoyaltyCustomerPage } from "@/lib/loyalty/customer-directory-types";

const filterSchema = z.object({ page: z.number().int().min(0).max(100000).default(0), query: z.string().trim().max(100).default(""), downloadedOnly: z.boolean().default(false) });
const count = z.number().int().nonnegative();
const loyalty = z.object({
  mode: z.enum(["stamps", "points"]),
  stampsCollected: count, stampsInCycle: count, rewardsRedeemed: count, availableStampRewards: count,
  pointsEarned: count, pointsSpent: count, pointsBalance: count, affordablePointRewards: count.nullable(),
}).nullable();
const directoryPage = z.object({
  rows: z.array(z.object({ id: z.string().uuid(), name: z.string(), joinedAt: z.string(), loyalty })),
  total: count, page: count, pageSize: z.number().int().positive(),
});
const directoryDetail = z.object({
  id: z.string().uuid(), name: z.string(), phone: z.string().nullable(),
  birthdayEnabled: z.boolean(), birthDate: z.string().nullable(), loyalty,
});

async function directoryContext() {
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("Customer directory access denied");
  if (!(await getCafeFeatureCodes(cafe.id)).includes("loyalty")) throw new Error("Loyalty unavailable");
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Authentication required");
  const [profile, brand] = await Promise.all([
    db.from("profiles").select("status").eq("id", user.id).maybeSingle(),
    db.from("cafes").select("status,owner_user_id").eq("id", cafe.id).is("deleted_at", null).maybeSingle(),
  ]);
  if (profile.error || brand.error || profile.data?.status !== "active" || !["active", "published"].includes(brand.data?.status ?? "")) throw new Error("Account unavailable");
  return { db, cafeId: cafe.id, isOwner: cafe.role === "owner" && brand.data?.owner_user_id === user.id };
}

export async function getOwnerLoyaltyCustomers(input: unknown = {}): Promise<LoyaltyCustomerPage> {
  const { page, query, downloadedOnly } = filterSchema.parse(input);
  const { db, cafeId } = await directoryContext();
  const { data, error } = await db.rpc("loyalty_customer_directory_page", {
    p_cafe: cafeId, p_page: page, p_query: query, p_members_only: downloadedOnly,
  });
  if (error || !data) throw new Error("Customer directory unavailable");
  return directoryPage.parse(data);
}

/** Contact details are returned for one selected customer after fresh authorization */
export async function getOwnerLoyaltyCustomerDetail(id: unknown, downloadedOnly: unknown = false): Promise<LoyaltyCustomerDetail> {
  const customerId = z.string().uuid().parse(id);
  const membersOnly = z.boolean().parse(downloadedOnly);
  const { db, cafeId, isOwner } = await directoryContext();
  const { data, error } = await db.rpc("loyalty_customer_directory_detail", {
    p_cafe: cafeId, p_customer: customerId, p_members_only: membersOnly,
  });
  if (error || !data) throw new Error("Customer unavailable");
  const detail = directoryDetail.parse(data);
  const region = cafeId === FAROUJ_CAFE_ID && detail.phone ? faroujCustomerPhone(detail.phone)?.region : null;
  const { data: cards, error: cardsError } = await db.from("loyalty_cards")
    .select("id,status,display_number,branch:branches!loyalty_card_branch_same_cafe(name)")
    .eq("cafe_id", cafeId).eq("customer_profile_id", customerId).order("display_number").order("id");
  if (cardsError) throw new Error("Card status unavailable");
  return {
    ...detail,
    ...(region ? { phoneCountryName: phoneRegionName(region, "ar") } : {}),
    canSuspendCards: isOwner,
    cards: (cards ?? []).map(card => ({
      id: String(card.id), number: card.display_number ?? null,
      branch: (Array.isArray(card.branch) ? card.branch[0] : card.branch)?.name ?? null,
      status: z.enum(["active", "suspended"]).parse(card.status),
    })),
  };
}

export async function suspendOwnerLoyaltyCard(id: unknown, cardId: unknown) {
  const { cafeId, isOwner, db } = await directoryContext();
  if (!isOwner) throw new Error("Card management forbidden");
  const { error } = await db.rpc("suspend_owner_loyalty_card", {
    p_cafe: cafeId, p_customer: z.string().uuid().parse(id), p_card: z.string().uuid().parse(cardId),
  });
  if (error) throw new Error("Card suspension failed");
}
