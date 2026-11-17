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
import { BranchInheritedMenu } from "@/components/dashboard/pages/branch-inherited-menu";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { redirect } from "next/navigation";

type MenuLoadResult =
  | { status: "ready"; menu: Awaited<ReturnType<typeof getOwnerMenu>>; branches: Awaited<ReturnType<typeof getOwnerMenuBranches>>["branches"]; branch: Awaited<ReturnType<typeof getOwnerMenuBranches>>["branches"][number] | null }
  | { status: "blocked" }
  | { status: "integrated" }
  | { status: "error" };

async function loadDashboardMenu(branchId?: string): Promise<MenuLoadResult> {
  try {
    const [features, cafe] = await Promise.all([getOwnerFeatureCodes(), requireOwnerCafeContext("menu")]);
    if (!cafe.staff && featureCodesAllow(features, "finance") && featureCodesAllow(features, "menu")) {
      return { status: "integrated" };
    }
    if (!featureCodesAllow(features, "menu")) {
      return { status: "blocked" };
    }

    // An explicit branch is independently tenant-validated by getOwnerMenu
    // Fetch its catalogue alongside the selector instead of waiting another round trip
    if (branchId && branchId !== "main") {
      const [{ branches }, menu] = await Promise.all([getOwnerMenuBranches(), getOwnerMenu(branchId)]);
      const branch = branches.find(item => item.id === branchId);
      return branch ? { status: "ready", menu, branches, branch } : { status: "error" };
    }
    const [{ branches }, menu] = await Promise.all([getOwnerMenuBranches(), getOwnerMenu("main")]);
    const branch = branches.find(item => item.brandMenuRoot) ?? null;
    return { status: "ready", menu, branches, branch };
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

  const branchId = (await searchParams).branch;
  const result = await loadDashboardMenu(branchId);

  if (result.status === "integrated") {
    const query = new URLSearchParams({ view: "products" });
    if (branchId && branchId !== "main") query.set("branch", branchId);
    redirect(`/dashboard/system/inventory/items?${query}`);
  }

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

  if (result.branch?.usesBrandMenu) {
    return <BranchInheritedMenu branch={result.branch} products={result.menu.products} categories={result.menu.categories} mainMenuHref="/dashboard/menu?branch=main" />;
  }

  const selectorBranches = result.branches.some(branch => branch.brandMenuRoot)
    ? result.branches.map(branch => branch.brandMenuRoot ? { ...branch, name: "المنيو الأساسي للعلامة" } : branch)
    : [{ id: "main", name: "المنيو الأساسي للعلامة", slug: "" }, ...result.branches];
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
      branches={selectorBranches}
    />
  );
}
