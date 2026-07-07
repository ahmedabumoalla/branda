export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { CoffeeSubscriptionsPage } from "@/components/dashboard/pages/coffee-subscriptions-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerCoffeeSubscriptionsDashboard } from "@/lib/data/coffee-subscriptions";

export default async function DashboardCoffeeSubscriptionsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <CoffeeSubscriptionsPage
        data={null}
        configError="قم بإعداد Supabase في .env.local"
      />
    );
  }

  try {
    const data = await getOwnerCoffeeSubscriptionsDashboard();
    return <CoffeeSubscriptionsPage data={data} />;
  } catch (error) {
    console.error("[DashboardCoffeeSubscriptionsPage]", error);
    return (
      <CoffeeSubscriptionsPage
        data={null}
        configError="تعذر تحميل اشتراكات القهوة"
      />
    );
  }
}
