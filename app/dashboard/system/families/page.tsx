import { getFamilies } from "@/app/actions/erp-families";
import { FamiliesWorkspace } from "@/components/erp/families/workspace";
import { AldeemLoadState } from "@/components/aldeem/load-state";

export const dynamic = "force-dynamic";
export default async function FamiliesPage() {
  const result = await getFamilies();
  return result.ok ? <FamiliesWorkspace initialSnapshot={result.data} /> : <AldeemLoadState title="الأسر المنتجة" message={result.message} />;
}
