export const dynamic = "force-dynamic";
export const revalidate = 0;

import { AdminSubscriptionRequestsPage } from "@/components/admin/pages/admin-subscription-requests-page";
import { getAdminSubscriptionRequestPage } from "@/lib/data/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export default async function SubscriptionRequestsRoute() {
  await requirePlatformAdmin();
  try {
    return <AdminSubscriptionRequestsPage initialData={await getAdminSubscriptionRequestPage()} />;
  } catch (error) {
    console.error("[SubscriptionRequestsRoute]", error);
    return <AdminSubscriptionRequestsPage initialData={{ requests: [], total: 0, page: 0, pageSize: 20, filter: "pending_review" }} configError="تعذر تحميل طلبات الاشتراك حاول تحديث القائمة" />;
  }
}
