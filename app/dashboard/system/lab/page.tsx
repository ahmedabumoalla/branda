import { LabWorkspace } from "@/components/erp/lab/lab-workspace";
import { getLabOrders } from "@/app/actions/erp-lab-orders";
import { LabLoadState } from "@/components/erp/lab/lab-load-state";

export const dynamic = "force-dynamic";
export default async function LabPage() {
  const result = await getLabOrders();
  return result.ok ? <LabWorkspace initialSnapshot={result.data} /> : <LabLoadState message={result.message} />;
}
