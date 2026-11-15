import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { FinanceLoyaltySettings } from "@/components/loyalty/finance-loyalty-settings";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { readFinanceLoyaltySettings } from "@/app/actions/finance-loyalty-settings";

export default async function LoyaltySettingsPage() {
  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "finance") || !featureCodesAllow(features, "loyalty")) return <DashboardFeatureBlockedState title="إعدادات الولاء" />;
  const result = await readFinanceLoyaltySettings();
  return <div className="mx-auto max-w-4xl p-4 sm:p-6"><FinanceLoyaltySettings initialResult={result} /></div>;
}
