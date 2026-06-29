export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";


import { ReservationsPageClient } from "@/components/dashboard/pages/reservations-page";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { getOwnerReservations } from "@/lib/data/reservations";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerCafeContext } from "@/lib/data/cafes";
import { featureCodesAllow } from "@/lib/platform/feature-gates";

export default async function ReservationsPage() {
  if (!isSupabaseConfigured()) return <ReservationsPageClient initialReservations={[]} initialServices={[]} menuProducts={[]} configError="قم بإعداد Supabase في .env.local" />;
  try {
    const features = await getOwnerFeatureCodes();
    if (!featureCodesAllow(features, "reservations")) {
      return <DashboardFeatureBlockedState title="الحجوزات" />;
    }

    const [reservations, services, menu, cafe] = await Promise.all([
      getOwnerReservations(),
      getOwnerReservationServices(),
      getOwnerMenu(),
      getOwnerCafeContext(),
    ]);
    return (
      <ReservationsPageClient
        initialReservations={reservations}
        initialServices={services}
        menuProducts={menu.products}
        businessCategory={cafe?.businessCategory}
      />
    );
  } catch {
    return <ReservationsPageClient initialReservations={[]} initialServices={[]} menuProducts={[]} configError="تعذر تحميل الحجوزات" />;
  }
}
