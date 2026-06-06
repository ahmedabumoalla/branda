import { SubscriptionPageClient } from "@/components/dashboard/pages/subscription-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerBranches } from "@/lib/data/branches";
import {
  getAvailablePlans,
  getOwnerActiveSubscription,
  getOwnerSubscriptionHistory,
  getOwnerSubscriptionRequests,
} from "@/lib/data/subscription";

export default async function SubscriptionPage() {
  if (!isSupabaseConfigured()) {
    return (
      <SubscriptionPageClient
        initialPlans={[]}
        initialActiveSubscription={null}
        initialHistory={[]}
        initialRequests={[]}
        initialBranches={[]}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const [plans, activeSubscription, history, requests, branches] = await Promise.all([
      getAvailablePlans(),
      getOwnerActiveSubscription(),
      getOwnerSubscriptionHistory(),
      getOwnerSubscriptionRequests(),
      getOwnerBranches(),
    ]);

    return (
      <SubscriptionPageClient
        initialPlans={plans}
        initialActiveSubscription={activeSubscription}
        initialHistory={history}
        initialRequests={requests}
        initialBranches={branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          active: branch.active,
        }))}
      />
    );
  } catch (error) {
    console.error("[SubscriptionPage]", error);
    return (
      <SubscriptionPageClient
        initialPlans={[]}
        initialActiveSubscription={null}
        initialHistory={[]}
        initialRequests={[]}
        initialBranches={[]}
        configError="تعذر تحميل بيانات الاشتراك"
      />
    );
  }
}
