import { AdminJobsPage } from "@/components/admin/pages/admin-jobs-page";
import { getAdminJobApplications } from "@/lib/data/jobs";

export default async function AdminJobsRoutePage() {
  try {
    return <AdminJobsPage initialApplications={await getAdminJobApplications()} />;
  } catch (error) {
    console.error("[AdminJobsRoutePage]", error);
    return <AdminJobsPage initialApplications={[]} configError="تعذر تحميل طلبات التوظيف" />;
  }
}
