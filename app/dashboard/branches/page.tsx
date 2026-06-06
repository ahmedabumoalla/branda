import { BranchesPageClient } from "@/components/dashboard/pages/branches-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
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
