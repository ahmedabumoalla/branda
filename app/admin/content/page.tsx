export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminContentPage } from "@/components/admin/pages/admin-content-page";
import { getAdminPlatformContentData } from "@/lib/data/platform-content";

export default async function AdminContentRoutePage() {
  try {
    const data = await getAdminPlatformContentData();
    return <AdminContentPage initialData={data} />;
  } catch (error) {
    console.error("[AdminContentRoutePage]", error);
    return <AdminContentPage initialData={null} configError="تعذر تحميل إدارة محتوى المنصة" />;
  }
}
