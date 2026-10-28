export const bookingStatuses = ["pending", "proposed", "confirmed", "rejected", "in_service", "completed", "cancelled"] as const;
export type BookingStatus = typeof bookingStatuses[number];
export type SalonBooking = {
  id: string; customerName: string; phone: string; status: BookingStatus; version: number;
  requestedStart: string; scheduledStart: string | null; proposedStart: string | null;
  service: { name?: string; price?: number; durationMinutes?: number }; createdAt: string;
  calledAt: string | null; completedAt: string | null; rating: number | null; review: string;
};
export type SalonMode = "owner" | "staff";
export type SalonCommand = "confirm" | "reject" | "propose" | "call" | "complete";
export type SalonFilter = { status?: "all" | "active" | "reviews" | BookingStatus; date?: string; page?: number; booking?: string };
export type SalonPage = { bookings: SalonBooking[]; total: number; page: number };
export type SalonAnnouncement = { id: string; title: string; description: string; active: boolean; service_id: string | null };
export const bookingLabels: Record<BookingStatus, string> = { pending: "بانتظار رد الصالون", proposed: "بانتظار موافقة العميل", confirmed: "مؤكد", rejected: "مرفوض", in_service: "تم النداء", completed: "اكتملت الخدمة", cancelled: "ملغي" };
export function salonTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short", calendar: "gregory" }).format(new Date(value)) : "لم يحدد";
}
/** All appointment inputs and displays use the salon's Saudi local time. */
export function salonInputTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("حدد تاريخ الموعد ووقته");
  const date = new Date(`${value}:00+03:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 3 * 3600000).toISOString().slice(0, 16) !== value) throw new Error("الموعد غير صحيح");
  return date.toISOString();
}
export function salonToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
