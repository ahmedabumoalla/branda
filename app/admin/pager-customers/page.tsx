import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { pagerDirectoryUrl, scalar } from "@/components/pager/customer-directory-ui";

export const dynamic = "force-dynamic";
export default async function PagerCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  const params = await searchParams;
  redirect(pagerDirectoryUrl("/admin/brand-customers", { view: "pager", brand: scalar(params.brand), phone: scalar(params.phone), query: scalar(params.query), page: scalar(params.page) }));
}
