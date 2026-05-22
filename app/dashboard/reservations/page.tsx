import { ReservationsPageClient } from "@/components/dashboard/pages/reservations-page";
import { mockReservations } from "@/lib/mock/reservations";

export default function ReservationsPage() {
  return <ReservationsPageClient initialReservations={mockReservations} />;
}