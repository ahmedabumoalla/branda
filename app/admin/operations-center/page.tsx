export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminOperationsCenterPage } from "@/components/admin/pages/admin-operations-center-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminOperationsCenter } from "@/lib/data/admin-operations-center";

export default async function AdminOperationsCenterRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminOperationsCenterPage
        data={{ brands: [], diagnostics: [] }}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getAdminOperationsCenter();
    return <AdminOperationsCenterPage data={data} />;
  } catch (error) {
    console.error("[AdminOperationsCenterRoutePage]", error);
    return (
      <AdminOperationsCenterPage
        data={{ brands: [], diagnostics: [] }}
        configError="تعذر تحميل مركز العمليات"
      />
    );
  }
}
