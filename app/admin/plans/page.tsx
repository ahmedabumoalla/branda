export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminPlansPage } from "@/components/admin/pages/admin-plans-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getAdminPlatformPlans, getAdminSubscriptionRequests } from "@/lib/data/admin";

export default async function AdminPlansRoutePage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminPlansPage
        initialPlans={[]}
        initialRequests={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [plans, requests] = await Promise.all([
      getAdminPlatformPlans(),
      getAdminSubscriptionRequests(),
    ]);

    return <AdminPlansPage initialPlans={plans} initialRequests={requests} />;
  } catch (error) {
    console.error("[AdminPlansRoutePage]", error);
    return (
      <AdminPlansPage
        initialPlans={[]}
        initialRequests={[]}
        configError="تعذر تحميل الباقات وطلبات الاشتراك"
      />
    );
  }
}
