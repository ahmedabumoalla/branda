export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOffers } from "@/lib/data/offers";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";

export default async function OffersPage() {
  if (!isSupabaseConfigured()) {
    return <OffersPageClient initialOffers={[]} initialProducts={[]} configError="قم بإعداد Supabase في ملف البيئة" />;
  }
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "offers")) return <DashboardFeatureBlockedState title="العروض" />;
  const result = await Promise.all([getOwnerOffers(), featureCodesAllow(features, "menu") ? getOwnerMenu() : Promise.resolve(null)]).catch(() => null);
  if (!result) {
    return <OffersPageClient initialOffers={[]} initialProducts={[]} configError="تعذر تحميل العروض" />;
  }
  const [offers, menu] = result;
  if (!menu) return <OffersPageClient initialOffers={offers} initialProducts={[]} />;
  return <OffersPageClient initialOffers={offers} initialProducts={menu.products} businessCategory={menu.cafe.businessCategory} rastSpotlight={menu.cafe.slug === "rast"} />;
}
