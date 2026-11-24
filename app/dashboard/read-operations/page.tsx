import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { ReadOperationsPage } from "@/components/dashboard/pages/read-operations-page";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerLoyaltyReads } from "@/lib/data/loyalty-read-operations";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { LoyaltyActivityLog } from "@/components/loyalty/loyalty-activity-log";
import { loadLoyaltyActivityAction } from "@/app/actions/loyalty-activity";
import { defaultLoyaltyActivityFilters } from "@/lib/loyalty/activity-types";
import { ChevronDown } from "lucide-react";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DashboardReadOperationsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const features = await getOwnerFeatureCodes().catch(() => null);
  if (!features) {
    return <ReadOperationsPage initialData={null} initialError="تعذر تحميل سجل عمليات القراءة حاول التحديث" />;
  }
  if (!featureCodesAllow(features, "loyalty")) {
    return <DashboardFeatureBlockedState title="سجل عمليات القراءة" />;
  }
  const filters = defaultLoyaltyActivityFilters();
  const { branch } = await searchParams;
  if (branch === "unassigned" || (branch && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch))) filters.branchId = branch;
  const [data, activity] = await Promise.all([getOwnerLoyaltyReads({ page: 1 }).catch((error: unknown) => {
    console.error("[DashboardReadOperationsPage]", error);
    return null;
  }), loadLoyaltyActivityAction(filters)]);
  return <div className="space-y-6">
    {activity && <section className="px-4 pt-6 sm:px-6" dir="rtl" aria-label="عمليات كاشير الولاء"><h1 className="mb-4 text-2xl font-bold">عمليات الكاشير</h1><LoyaltyActivityLog key={filters.branchId} initialResult={activity} initialFilters={filters} /></section>}
    {activity ? <details className="group mx-4 rounded-2xl border border-[#e6d9ca] bg-white sm:mx-6">
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center justify-between gap-3 px-5 py-4 font-bold text-[#3a2418] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b67a30]">
        <span className="inline-flex items-center gap-2"><ChevronDown size={18} className="group-open:rotate-180" aria-hidden="true" />قراءات البطاقات والمزامنة</span>
        <span className="text-sm font-normal text-[#716052]">{data && data.counts.pending + data.counts.processing + data.counts.failed + data.counts.needs_review > 0 ? "توجد عمليات تنتظر المتابعة" : "عرض حالة القراءات وإعادة المحاولة"}</span>
      </summary>
      <ReadOperationsPage initialData={data} initialError={data ? undefined : "تعذر تحميل سجل عمليات القراءة حاول التحديث"} />
    </details> : <ReadOperationsPage initialData={data} initialError={data ? undefined : "تعذر تحميل سجل عمليات القراءة حاول التحديث"} />}
  </div>;
}
