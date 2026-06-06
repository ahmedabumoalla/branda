import { AdminCafesPage } from "@/components/admin/pages/admin-cafes-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import {
  getAdminCafes,
  getAdminCustomers,
  getAdminOperations,
  getPlatformPlans,
} from "@/lib/data/admin";
import {
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
  mockPlatformPlans,
} from "@/lib/platform/admin-data";

export default async function AdminCafesRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminCafesPage
        initialCafes={mockPlatformCafes}
        initialPlans={mockPlatformPlans}
        initialCustomers={mockPlatformCustomers}
        initialOperations={mockPlatformOperations}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [cafes, plans, customers, operations] = await Promise.all([
      getAdminCafes(),
      getPlatformPlans(),
      getAdminCustomers(),
      getAdminOperations(),
    ]);
    return (
      <AdminCafesPage
        initialCafes={cafes}
        initialPlans={plans}
        initialCustomers={customers}
        initialOperations={operations}
      />
    );
  } catch {
    return (
      <AdminCafesPage
        initialCafes={[]}
        initialPlans={mockPlatformPlans}
        initialCustomers={[]}
        initialOperations={[]}
        configError="تعذر تحميل الكوفيهات"
      />
    );
  }
}
