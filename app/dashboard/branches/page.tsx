export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { BranchesPageClient } from "@/components/dashboard/pages/branches-page";
import { BranchMenusPage } from "@/components/dashboard/pages/branch-menus-page";
import { getOwnerMenuBranches } from "@/lib/data/menu-branches";
import { isStorefrontEnabled } from "@/lib/platform/storefront-availability";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerBranches } from "@/lib/data/branches";

export default async function BranchesPage() {
  if (!isStorefrontEnabled()) {
    const { cafe, branches } = await getOwnerMenuBranches();
    return <BranchMenusPage branches={branches} slug={cafe.slug} />;
  }
  if (!isSupabaseConfigured()) {
    return <BranchesPageClient initialBranches={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  const branches = await getOwnerBranches().catch(() => null);
  return <BranchesPageClient initialBranches={branches ?? []} configError={branches ? undefined : "تعذر تحميل الفروع"} />;
}
