import { SubscriptionPageClient } from "@/components/dashboard/pages/subscription-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerActivePlanId, getPlatformPlans } from "@/lib/data/admin";
import {
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
      getPlatformPlans(),
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
