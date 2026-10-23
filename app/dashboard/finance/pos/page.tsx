import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { FinancePOS } from "@/components/finance/finance-pos";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getBrandFinanceSnapshot } from "@/lib/data/brand-finance";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export const dynamic = "force-dynamic";

export default async function FinancePOSPage() {
  const features = await getOwnerFeatureCodes();
  if (!featureCodesAllow(features, "finance_pos")) return <DashboardFeatureBlockedState title="الكاشير المالي" />;
  const snapshot = await getBrandFinanceSnapshot();
  return <FinancePOS initialSnapshot={snapshot} />;
}
