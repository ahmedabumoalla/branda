export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { SubscriptionPageClient } from "@/components/dashboard/pages/subscription-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerActivePlanId } from "@/lib/data/admin";
import {
  getAvailablePlans,
  getOwnerPendingSubscription,
  getOwnerSubscriptionHistory,
} from "@/lib/data/subscription";
import { mockPlatformPlans } from "@/lib/platform/admin-data";

export default async function SubscriptionPage() {
  if (!isSupabaseConfigured()) {
    return (
      <SubscriptionPageClient
        initialPlans={mockPlatformPlans}
        initialActivePlanId=""
        initialHistory={[]}
        initialPending={null}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [plans, activePlanId, history, pending] = await Promise.all([
      getAvailablePlans(),
      getOwnerActivePlanId(),
      getOwnerSubscriptionHistory(),
      getOwnerPendingSubscription(),
    ]);

    return (
      <SubscriptionPageClient
        initialPlans={plans}
        initialActivePlanId={activePlanId}
        initialHistory={history}
        initialPending={pending}
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
        configError="تعذر تحميل الاشتراك والباقات"
      />
    );
  }
}
