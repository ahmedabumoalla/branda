export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminClientBrandsPage } from "@/components/admin/pages/admin-client-brands-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminClientBrandsData } from "@/lib/data/platform-content";

export default async function AdminClientBrandsRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminClientBrandsPage
        initialData={{
          promotions: [],
          availableItems: [],
          promotionsTableMissing: true,
        }}
        configError="قم بإعداد Supabase قبل إدارة علامات العملاء."
      />
    );
  }

  try {
    const data = await getAdminClientBrandsData();
    return <AdminClientBrandsPage initialData={data} />;
  } catch (error) {
    console.error("[AdminClientBrandsRoutePage]", error);
    return (
      <AdminClientBrandsPage
        initialData={{
          promotions: [],
          availableItems: [],
          promotionsTableMissing: true,
        }}
        configError="تعذر تحميل إدارة العلامات التجارية للعملاء."
      />
    );
  }
}
