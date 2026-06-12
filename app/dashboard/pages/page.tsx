export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { PagesManagerPageClient } from "@/components/dashboard/pages/pages-manager-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerPages } from "@/lib/data/pages";

export default async function PagesManagerPage() {
  if (!isSupabaseConfigured()) {
    return <PagesManagerPageClient initialPages={[]} configError="قم بإعداد Supabase في .env.local" />;
  }
  try {
    return <PagesManagerPageClient initialPages={await getOwnerPages()} />;
  } catch {
    return <PagesManagerPageClient initialPages={[]} configError="تعذر تحميل الصفحات" />;
  }
}
