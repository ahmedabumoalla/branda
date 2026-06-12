export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { AdminReservationsMonitorPage } from "@/components/admin/pages/admin-reservations-monitor-page";
import { getAdminReservationMonitor } from "@/lib/data/reservations";

export default async function AdminReservationsRoutePage() {
  try {
    const reservations = await getAdminReservationMonitor();
    return <AdminReservationsMonitorPage reservations={reservations} />;
  } catch (error) {
    console.error("[AdminReservationsRoutePage]", error);
    return <AdminReservationsMonitorPage reservations={[]} configError="تعذر تحميل مراقبة الحجوزات" />;
  }
}
