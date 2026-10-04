import "server-only";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createClient } from "@/lib/supabase/server";
import { loyaltyActivityPageSchema, parseLoyaltyActivityFilters } from "@/lib/loyalty/activity-validation";
import type { LoyaltyActivityFilters, LoyaltyActivityPage } from "@/lib/loyalty/activity-types";

export async function getOwnerLoyaltyActivity(input: LoyaltyActivityFilters): Promise<LoyaltyActivityPage> {
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("Loyalty activity access denied");
  if (!featureCodesAllow(await getOwnerFeatureCodes(), "loyalty")) throw new Error("Loyalty unavailable");
  const { filters, from, to } = parseLoyaltyActivityFilters(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_owner_loyalty_activity", {
    p_cafe_id: cafe.id, p_from: from, p_to: to,
    p_cashier_id: filters.cashierId || null,
    p_kind: filters.kind || null, p_outcome: filters.outcome || null,
    p_search: filters.search, p_page: filters.page, p_page_size: 25,
  });
  if (error) throw new Error("Loyalty activity unavailable");
  return loyaltyActivityPageSchema.parse(data);
}
