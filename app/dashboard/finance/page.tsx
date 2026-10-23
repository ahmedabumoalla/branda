import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export const dynamic = "force-dynamic";

export default async function FinanceDashboardPage() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "finance")) return <DashboardFeatureBlockedState title="برندة المالية" />;
  const snapshot = await getBrandFinanceSnapshot();
  return <FinanceWorkspace initialSnapshot={snapshot} />;
}
