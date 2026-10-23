import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { redirect } from "next/navigation";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export const dynamic = "force-dynamic";

export default async function FinancePOSPage() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "finance_pos")) return <DashboardFeatureBlockedState title="الكاشير المالي" />;
  const cafe = await requireOwnerCafeContext();
  redirect(`/finance/${encodeURIComponent(cafe.slug)}/pos`);
}
