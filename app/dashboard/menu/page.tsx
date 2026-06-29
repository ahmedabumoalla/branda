export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerMenu } from "@/lib/data/menu";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function DashboardMenuPage() {
  if (!isSupabaseConfigured()) {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="قم بإعداد Supabase في .env.local ثم شغّل migration"
      />
    );
  }

  try {
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "menu")) {
      return <DashboardFeatureBlockedState title="المنيو والمنتجات" />;
    }

    const menu = await getOwnerMenu();
    return (
      <MenuPageClient
        initialProducts={menu.products}
        initialCategories={menu.categories}
        businessCategory={menu.cafe.businessCategory}
      />
    );
  } catch {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="تعذر تحميل المنيو — تأكد من تسجيل الدخول وربط العلامة"
      />
    );
  }
}
