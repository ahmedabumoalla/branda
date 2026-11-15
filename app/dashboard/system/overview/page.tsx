import { getOverview } from "@/app/actions/erp-overview";
import { AldeemOverview } from "@/components/aldeem/overview";
import { AldeemLoadState } from "@/components/aldeem/load-state";

export const dynamic = "force-dynamic";
export default async function OverviewPage() {
  const result = await getOverview();
  return result.ok ? <AldeemOverview initialSnapshot={result.data} /> : <AldeemLoadState title="نظرة عامة" message={result.message} />;
}
