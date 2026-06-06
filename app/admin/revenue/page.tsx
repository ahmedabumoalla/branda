import { AdminRevenuePage } from "@/components/admin/pages/admin-revenue-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getAdminCafes } from "@/lib/data/admin";
import { mockPlatformCafes } from "@/lib/platform/admin-data";

export default async function AdminRevenueRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminRevenuePage initialCafes={mockPlatformCafes} configError="قم بإعداد Supabase في .env.local" />
    );
  }

  try {
    const cafes = await getAdminCafes();
    return <AdminRevenuePage initialCafes={cafes} />;
  } catch {
    return <AdminRevenuePage initialCafes={[]} configError="تعذر تحميل بيانات الإيرادات" />;
  }
}
