export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { BranchMenusPage } from "@/components/dashboard/pages/branch-menus-page";
import { getOwnerMenuBranches } from "@/lib/data/menu-branches";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";

export default async function BranchesPage() {
  if (!isSupabaseConfigured()) {
    return <BranchMenusPage branches={[]} slug="" configError="خدمة الفروع غير جاهزة حاليًا" />;
  }
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "menu") || !featureCodesAllow(features, "branches") || featureCodesAllow(features, "finance")) return <DashboardFeatureBlockedState title="الفروع" />;
  const result = await getOwnerMenuBranches().catch(() => null);
  return <BranchMenusPage branches={result?.branches ?? []} slug={result?.cafe.slug ?? ""} configError={result ? undefined : "تعذر تحميل الفروع أعد تحميل الصفحة"} />;
}
