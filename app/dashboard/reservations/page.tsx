
import { ReservationsPageClient } from "@/components/dashboard/pages/reservations-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerReservations } from "@/lib/data/reservations";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";

export default async function ReservationsPage() {
  if (!isSupabaseConfigured()) return <ReservationsPageClient initialReservations={[]} initialServices={[]} configError="قم بإعداد Supabase في .env.local" />;
  try {
    const [reservations, services] = await Promise.all([getOwnerReservations(), getOwnerReservationServices()]);
    return <ReservationsPageClient initialReservations={reservations} initialServices={services} />;
  } catch {
    return <ReservationsPageClient initialReservations={[]} initialServices={[]} configError="تعذر تحميل الحجوزات" />;
  }
}
