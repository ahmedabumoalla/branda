import { ReservationsPageClient } from "@/components/dashboard/pages/reservations-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerReservations } from "@/lib/data/reservations";

export default async function ReservationsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <ReservationsPageClient initialReservations={[]} configError="قم بإعداد Supabase في .env.local" />
    );
  }

  try {
    const reservations = await getOwnerReservations();
    return <ReservationsPageClient initialReservations={reservations} />;
  } catch {
    return (
      <ReservationsPageClient
        initialReservations={[]}
        configError="تعذر تحميل الحجوزات — تأكد من تسجيل الدخول"
      />
    );
  }
}
