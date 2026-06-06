import { AdminOperationsPage } from "@/components/admin/pages/admin-operations-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getAdminOperations } from "@/lib/data/admin";
import { mockPlatformOperations } from "@/lib/platform/admin-data";

export default async function AdminOperationsRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminOperationsPage
        initialOperations={mockPlatformOperations}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const operations = await getAdminOperations();
    return <AdminOperationsPage initialOperations={operations} />;
  } catch {
    return (
      <AdminOperationsPage initialOperations={[]} configError="تعذر تحميل العمليات" />
    );
  }
}
