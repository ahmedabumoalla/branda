import { redirect } from "next/navigation";
import { BrandCustomersPage } from "@/components/admin/pages/brand-customers-page";
import { loadBrandCustomersAction } from "@/app/actions/brand-customers";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function BrandCustomersRoute() {
  try { await requirePlatformAdmin(); } catch { redirect("/login"); }
  return <BrandCustomersPage initialResult={await loadBrandCustomersAction({})} />;
}
