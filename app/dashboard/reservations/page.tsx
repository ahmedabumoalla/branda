export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";


import { ReservationsPageClient } from "@/components/dashboard/pages/reservations-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerReservations } from "@/lib/data/reservations";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerCafeContext } from "@/lib/data/cafes";

export default async function ReservationsPage() {
  if (!isSupabaseConfigured()) return <ReservationsPageClient initialReservations={[]} initialServices={[]} menuProducts={[]} configError="قم بإعداد Supabase في .env.local" />;
  try {
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
