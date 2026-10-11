export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { RastOffersPage } from "@/components/dashboard/pages/rast-offers-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOffers } from "@/lib/data/offers";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { createClient } from "@/lib/supabase/server";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import { requireOwnerCafeContext } from "@/lib/data/cafes";

export default async function OffersPage() {
  if (!isSupabaseConfigured()) {
    return <OffersPageClient initialOffers={[]} initialProducts={[]} configError="قم بإعداد Supabase في ملف البيئة" />;
  }
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "offers")) return <DashboardFeatureBlockedState title="العروض" />;
  const result = await Promise.all([getOwnerOffers(), featureCodesAllow(features, "menu") ? getOwnerMenu() : Promise.resolve(null), requireOwnerCafeContext()]).catch(() => null);
  if (!result) {
    return <OffersPageClient initialOffers={[]} initialProducts={[]} configError="تعذر تحميل العروض" />;
  }
  const [offers, menu, cafe] = result;
  if (!menu) return <RastOffersPage initialOffers={offers} products={[]} brandName={cafe.name} slug={cafe.slug} />;
  {
    const paths = menu.products.map((product) => product.imageAssetId).filter((path): path is string => Boolean(path && isOwnedMenuAsset(path, menu.cafe.id)));
    const supabase = await createClient();
    const { data: images } = paths.length ? await supabase.storage.from("menu-products").createSignedUrls([...new Set(paths)], 3600) : { data: [] };
    const signed = new Map((images ?? []).filter((image) => !image.error).map((image) => [image.path, image.signedUrl]));
    const products = menu.products.map((product) => ({ ...product, imageDataUrl: signed.get(product.imageAssetId ?? "") || product.imageDataUrl }));
    return <RastOffersPage initialOffers={offers} products={products} brandName={cafe.name} slug={cafe.slug} />;
  }
}
