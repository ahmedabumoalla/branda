import { notFound } from "next/navigation";
import { getBranchMonitor, getCashTrail } from "@/app/actions/erp-tracking";
import { BranchMonitorView, CashTrailView, ItemTraceView } from "@/components/aldeem/tracking";
import { AldeemLoadState } from "@/components/aldeem/load-state";

export const dynamic = "force-dynamic";
export default async function TrackingPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const view = (await params).view?.[0] ?? "monitor";
  if (view === "items") return <ItemTraceView />;
  if (view === "cash") {
    const result = await getCashTrail();
    return result.ok ? <CashTrailView initialSnapshot={result.data} /> : <AldeemLoadState title="تتبع النقد" message={result.message} />;
  }
  if (view !== "monitor") notFound();
  const result = await getBranchMonitor();
  return result.ok ? <BranchMonitorView initialSnapshot={result.data} /> : <AldeemLoadState title="متابعة الفروع" message={result.message} />;
}
