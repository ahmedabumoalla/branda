export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { BranchesPageClient } from "@/components/dashboard/pages/branches-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerBranches } from "@/lib/data/branches";

export default async function BranchesPage() {
  if (!isSupabaseConfigured()) {
    return <BranchesPageClient initialBranches={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    return <BranchesPageClient initialBranches={await getOwnerBranches()} />;
  } catch {
    return (
      <BranchesPageClient initialBranches={[]} configError="تعذر تحميل الفروع" />
    );
  }
}
