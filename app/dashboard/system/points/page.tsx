import { getPoints } from "@/app/actions/erp-points";
import { PointsWorkspace } from "@/components/aldeem/points";
import { AldeemLoadState } from "@/components/aldeem/load-state";

export const dynamic = "force-dynamic";
export default async function PointsPage() {
  const result = await getPoints();
  return result.ok ? <PointsWorkspace initialSnapshot={result.data} /> : <AldeemLoadState title="نقاط الولاء" message={result.message} />;
}
