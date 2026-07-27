export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OperationalCashierPageClient } from "@/components/dashboard/pages/operational-cashier-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import {
  getOwnerCashierOperations,
  type CashierOperationsDashboard,
} from "@/lib/data/loyalty-cards";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

const emptyDashboard: CashierOperationsDashboard = {
  cafeId: "",
  cafeSlug: "",
  cafeName: "",
  businessCategory: "cafes_coffee",
  cashiers: [],
  activities: [],
};

export default async function DashboardCashierPage() {
  if (!isSupabaseConfigured()) {
    return (
      <OperationalCashierPageClient
        initialDashboard={emptyDashboard}
        configError="قم بإعداد Supabase في ملف البيئة"
      />
    );
  }

  try {
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "cashier")) {
      return <DashboardFeatureBlockedState title="الكاشير" />;
    }

    const dashboard = await getOwnerCashierOperations();
    return <OperationalCashierPageClient initialDashboard={dashboard} />;
  } catch (error) {
    console.error("[DashboardCashierPage]", error);
    return (
      <OperationalCashierPageClient
        initialDashboard={emptyDashboard}
        configError="تعذر تحميل خدمات التشغيل"
      />
    );
  }
}
