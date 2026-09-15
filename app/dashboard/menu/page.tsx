export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerMenu } from "@/lib/data/menu";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

type MenuLoadResult =
  | { status: "ready"; menu: Awaited<ReturnType<typeof getOwnerMenu>> }
  | { status: "blocked" }
  | { status: "error" };

async function loadDashboardMenu(): Promise<MenuLoadResult> {
  try {
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "menu")) {
      return { status: "blocked" };
    }

    return { status: "ready", menu: await getOwnerMenu() };
  } catch {
    return { status: "error" };
  }
}

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

  const result = await loadDashboardMenu();

  if (result.status === "blocked") {
    return <DashboardFeatureBlockedState title="المنيو والمنتجات" />;
  }

  if (result.status === "error") {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="تعذر تحميل المنيو — تأكد من تسجيل الدخول وربط العلامة"
      />
    );
  }

  const menuDataKey = [
    ...result.menu.products.map((product) => product.id).sort(),
    "categories",
    ...result.menu.categories.map((category) => category.id).sort(),
  ].join(":");

  return (
    <MenuPageClient
      key={menuDataKey}
      initialProducts={result.menu.products}
      initialCategories={result.menu.categories}
      businessCategory={result.menu.cafe.businessCategory}
    />
  );
}
