export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerMenu } from "@/lib/data/menu";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { getOwnerMenuBranches } from "@/lib/data/menu-branches";

type MenuLoadResult =
  | { status: "ready"; menu: Awaited<ReturnType<typeof getOwnerMenu>>; branch: Awaited<ReturnType<typeof getOwnerMenuBranches>>["branches"][number] | null }
  | { status: "blocked" }
  | { status: "error" };

async function loadDashboardMenu(branchId?: string): Promise<MenuLoadResult> {
  try {
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "menu")) {
      return { status: "blocked" };
    }

    const { branches } = await getOwnerMenuBranches();
    const branch = branchId ? branches.find(item => item.id === branchId) : branches.find(item => item.primary) ?? branches[0];
    if (branchId && !branch) return { status: "error" };
    return { status: "ready", menu: await getOwnerMenu(branch?.id ?? null), branch: branch ?? null };
  } catch {
    return { status: "error" };
  }
}

export default async function DashboardMenuPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  if (!isSupabaseConfigured()) {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="قم بإعداد Supabase في .env.local ثم شغّل migration"
      />
    );
  }

  const result = await loadDashboardMenu((await searchParams).branch);

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
    result.branch?.id ?? "unbranched",
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
      cafeSlug={result.menu.cafe.slug}
      branchId={result.branch?.id ?? null}
      branchName={result.branch?.name}
      branchSlug={result.branch?.slug}
    />
  );
}
