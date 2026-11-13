import { redirect } from "next/navigation";
import { BrandCustomersPage } from "@/components/admin/pages/brand-customers-page";
import { loadBrandCustomersAction } from "@/app/actions/brand-customers";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { PagerBrandCustomersPage } from "@/components/admin/pages/pager-brand-customers-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function BrandCustomersRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  const params = await searchParams;
  if (params.view === "pager") return await PagerBrandCustomersPage({ params });
  return <BrandCustomersPage initialResult={await loadBrandCustomersAction({})} />;
}
