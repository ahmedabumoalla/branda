import { AdminContactRequestsPage } from "@/components/admin/pages/admin-contact-requests-page";
import { getAdminContactRequests } from "@/lib/data/contact-requests";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export const dynamic = "force-dynamic";

export default async function ContactRequestsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePlatformAdmin();
  const query = await searchParams;
  const result = await getAdminContactRequests(Number(query.page || 1)).catch(() => null);
  return result ? <AdminContactRequestsPage {...result} /> : <AdminContactRequestsPage requests={[]} page={1} count={0} error="تعذر تحميل طلبات التواصل" />;
}
