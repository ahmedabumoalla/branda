import { AdminHomePage } from "@/components/admin/pages/admin-home-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import {
  createEmptyAdminDashboardOverview,
  getAdminDashboardOverview,
} from "@/lib/data/admin-dashboard";

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminHomePage
        overview={createEmptyAdminDashboardOverview()}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const overview = await getAdminDashboardOverview();

    return <AdminHomePage overview={overview} />;
  } catch (error) {
    console.error("[AdminPage]", error);

    return (
      <AdminHomePage
        overview={createEmptyAdminDashboardOverview()}
        configError="تعذر تحميل بيانات لوحة المنصة"
      />
    );
  }
}