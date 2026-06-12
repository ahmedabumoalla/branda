export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { MenuPageClient } from "@/components/dashboard/pages/menu-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerMenu } from "@/lib/data/menu";

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
    const { products, categories } = await getOwnerMenu();
    return <MenuPageClient initialProducts={products} initialCategories={categories} />;
  } catch {
    return (
      <MenuPageClient
        initialProducts={[]}
        initialCategories={[]}
        configError="تعذر تحميل المنيو — تأكد من تسجيل الدخول وربط المقهى"
      />
    );
  }
}