import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext, requirePlatformAdmin } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import {
  mapDbReservationToCafeReservation,
  mapReservationStatusToDb,
} from "@/lib/data/mappers";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";
import { escapeEmailHtml, isBrandaEmailConfigured, sendBrandaEmail } from "@/lib/email/resend";

export type AdminReservationMonitorItem = CafeReservation & {
  cafeId: string;
  cafeName: string;
  cafeSlug: string;
  pendingMinutes: number;
};

export async function getOwnerReservations(): Promise<CafeReservation[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbReservationToCafeReservation);
}

export async function getAdminReservationMonitor(): Promise<AdminReservationMonitorItem[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*, cafes(id, name, slug)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  const now = Date.now();
  return (data ?? []).map((row) => {
    const cafe = row.cafes as Record<string, unknown> | null;
    const reservation = mapDbReservationToCafeReservation(row as Record<string, unknown>);
    return {
      ...reservation,
      cafeId: String(cafe?.id ?? row.cafe_id ?? ""),
      cafeName: String(cafe?.name ?? "علامة غير معروفة"),
      cafeSlug: String(cafe?.slug ?? ""),
      pendingMinutes:
        reservation.status === "بانتظار الرد"
          ? Math.max(0, Math.floor((now - new Date(reservation.createdAt).getTime()) / 60000))
          : 0,
    };
  });
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  cafeMessage?: string,
  rejectionReason?: string
) {
  await requireOwnerCafeContext();
  const supabase = await createClient();

  if (status === "بانتظار الرد") {
    throw new Error("Invalid reservation status transition");
  }

  const message = (cafeMessage ?? rejectionReason)?.trim() || null;
  const { error } = await supabase.rpc("respond_to_reservation", {
    p_reservation_id: reservationId,
    p_status: mapReservationStatusToDb(status),
    p_message: message,
  });

  if (error) throw error;

  if (isBrandaEmailConfigured()) {
    const { data: row } = await supabase
      .from("reservations")
      .select("customer_name, phone, event_type, reservation_date, reservation_time, customer_profiles(email)")
      .eq("id", reservationId)
      .maybeSingle();
    const customerRaw = row?.customer_profiles as unknown;
    const customer = Array.isArray(customerRaw) ? customerRaw[0] as Record<string, unknown> | undefined : customerRaw as Record<string, unknown> | undefined;
    const customerEmail = customer?.email ? String(customer.email) : undefined;
    if (customerEmail) {
      await sendBrandaEmail({
        to: customerEmail,
        subject: status === "مقبول" ? "تم قبول حجزك في برندة" : status === "مرفوض" ? "تم رفض حجزك في برندة" : "اقتراح تعديل على حجزك في برندة",
        text: `تم تحديث حالة حجزك: ${status}. ${message ?? ""}`,
        html: `<div dir="rtl"><h2>تم تحديث حالة حجزك</h2><p>الحالة: ${escapeEmailHtml(status)}</p><p>${escapeEmailHtml(message ?? "")}</p></div>`,
      }).catch(() => undefined);
    }
  }
}

const createReservationSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  type: z.string(),
  guests: z.number().int().positive().max(500),
  date: z.string(),
  time: z.string(),
  durationMinutes: z.number().int().positive().optional(),
  branchName: z.string().optional(),
  spaceType: z.string().optional(),
  eventTitle: z.string().optional(),
  needsDecoration: z.boolean().optional(),
  needsCatering: z.boolean().optional(),
  budgetEstimate: z.number().optional(),
  notes: z.string().optional(),
});

export async function createReservation(input: z.infer<typeof createReservationSchema>) {
  const parsed = createReservationSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { data: reservationId, error } = await supabase.rpc("create_customer_reservation_v2", {
    p_cafe_id: cafe.id,
    p_reservation_service_id: parsed.serviceId ?? null,
    p_event_type: parsed.type,
    p_guests: parsed.guests,
    p_reservation_date: parsed.date,
    p_reservation_time: parsed.time,
    p_duration_minutes: parsed.durationMinutes ?? null,
    p_branch_name: parsed.branchName ?? null,
    p_space_type: parsed.spaceType ?? null,
    p_event_title: parsed.eventTitle ?? null,
    p_needs_decoration: parsed.needsDecoration ?? false,
    p_needs_catering: parsed.needsCatering ?? false,
    p_budget_estimate: parsed.budgetEstimate ?? null,
    p_notes: parsed.notes ?? null,
  });

  if (error) throw error;

  if (isBrandaEmailConfigured()) {
    const { data: settings } = await supabase
      .from("cafe_settings")
      .select("owner_email, owner_name")
      .eq("cafe_id", cafe.id)
      .maybeSingle();
    const ownerEmail = settings?.owner_email ? String(settings.owner_email) : undefined;
    if (ownerEmail) {
      await sendBrandaEmail({
        to: ownerEmail,
        subject: "حجز جديد وصل للعلامة عبر برندة",
        text: `وصل حجز جديد من عميل للنوع ${parsed.type} بتاريخ ${parsed.date} الساعة ${parsed.time}.`,
        html: `<div dir="rtl"><h2>حجز جديد</h2><p>نوع الحجز: ${escapeEmailHtml(parsed.type)}</p><p>التاريخ: ${escapeEmailHtml(parsed.date)} - ${escapeEmailHtml(parsed.time)}</p><p>عدد الأشخاص: ${parsed.guests}</p><p>الملاحظات: ${escapeEmailHtml(parsed.notes ?? "-")}</p></div>`,
      }).catch(() => undefined);
    }
  }

  return reservationId as string;
}
