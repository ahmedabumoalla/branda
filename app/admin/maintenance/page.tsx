export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminMaintenancePage } from "@/components/admin/pages/admin-maintenance-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export default async function AdminMaintenanceRoutePage() {
  if (!isSupabaseConfigured()) {
    return <AdminMaintenancePage configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    await requirePlatformAdmin();
    return <AdminMaintenancePage />;
  } catch {
    return <AdminMaintenancePage configError="هذه الصفحة متاحة فقط لمدير المنصة" />;
  }
}
