export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { SubscriptionPageClient } from "@/components/dashboard/pages/subscription-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getCafeFeatureOverrides, getOwnerActivePlanId } from "@/lib/data/admin";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import {
  getAvailablePlans,
  getOwnerPendingSubscription,
  getOwnerSubscriptionHistory,
} from "@/lib/data/subscription";
import { mockPlatformPlans } from "@/lib/platform/admin-data";
import { getEffectiveBrandFeatureAccess, getPlanIncludedFeatures } from "@/lib/platform/feature-access";

export default async function SubscriptionPage() {
  if (!isSupabaseConfigured()) {
    return (
      <SubscriptionPageClient
        initialPlans={mockPlatformPlans}
        initialActivePlanId=""
        initialHistory={[]}
        initialPending={null}
        initialFeatureAccess={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [plans, activePlanId, history, pending, cafe] = await Promise.all([
      getAvailablePlans(),
      getOwnerActivePlanId(),
      getOwnerSubscriptionHistory(),
      getOwnerPendingSubscription(),
      getOwnerCafeContext(),
    ]);
    const featureOverrides = cafe ? await getCafeFeatureOverrides(cafe.id).catch(() => []) : [];
    const initialFeatureAccess = getEffectiveBrandFeatureAccess(
      getPlanIncludedFeatures(activePlanId, plans),
      featureOverrides,
    );

    return (
      <SubscriptionPageClient
        initialPlans={plans}
        initialActivePlanId={activePlanId}
        initialHistory={history}
        initialPending={pending}
        initialFeatureAccess={initialFeatureAccess}
      />
    );
  } catch (error) {
    console.error("[SubscriptionPage]", error);
    return (
      <SubscriptionPageClient
        initialPlans={[]}
        initialActivePlanId=""
        initialHistory={[]}
        initialPending={null}
        initialFeatureAccess={[]}
        configError="تعذر تحميل الاشتراك والباقات"
      />
    );
  }
}
