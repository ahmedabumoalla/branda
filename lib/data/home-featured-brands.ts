import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentSubscription } from "@/lib/platform/active-subscription";
import { homeBrands } from "@/lib/marketing/home-brands";

type Subscription = { status: string; started_at: string | null; expires_at: string | null; platform_plans: { active: boolean; price_sar: number } | null };
type BrandRow = { slug: string; subscriptions: Subscription[] };

// Owner explicitly requested Tea and Bakery in the showcase on 2026-11-17
// This display exception does not grant services or change its subscription
const explicitlyFeaturedTrial = "brand-9010051467ed";

/** Only approved public brands with current subscriptions leave this boundary */
export async function getHomeFeaturedBrandSlugs(): Promise<string[]> {
  try {
    const { data, error } = await createAdminClient().from("cafes")
      .select("slug,subscriptions(status,started_at,expires_at,platform_plans(active,price_sar))")
      .in("slug", homeBrands.map(brand => brand.slug)).eq("is_public", true)
      .in("status", ["active", "published"]).is("deleted_at", null);
    if (error) throw error;
    const now = Date.now();
    return ((data ?? []) as unknown as BrandRow[]).filter(brand => brand.subscriptions.some(subscription =>
      isCurrentSubscription(subscription, now) && (
        (subscription.status === "active" && Number(subscription.platform_plans?.price_sar) > 0)
        || (brand.slug === explicitlyFeaturedTrial && subscription.status === "trialing")
      )
    )).map(brand => brand.slug);
  } catch {
    // Hide the showcase if eligibility cannot be verified; never invent customers
    return [];
  }
}
