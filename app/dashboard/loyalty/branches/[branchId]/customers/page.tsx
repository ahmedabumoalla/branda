import { BranchCustomersReport } from "@/components/loyalty/branch-customers-report";
import { loadLoyaltyBranchReportAction } from "@/app/actions/loyalty-branch-report";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BranchCustomersPage({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  if (branchId !== "unassigned" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) notFound();
  const filters = { branchId, from: "", to: "", search: "", page: 1 };
  return <BranchCustomersReport key={branchId} initial={await loadLoyaltyBranchReportAction(filters)} filters={filters} />;
}
