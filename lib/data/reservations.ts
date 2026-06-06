import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import {
  mapDbReservationToCafeReservation,
  mapReservationStatusToDb,
} from "@/lib/data/mappers";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";

export async function getOwnerReservations(): Promise<CafeReservation[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("reservation_date", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapDbReservationToCafeReservation);
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
}

const createReservationSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid(),
  type: z.string(),
  guests: z.number().int().positive(),
  date: z.string(),
  time: z.string(),
  durationMinutes: z.number().optional(),
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
  const { data: reservationId, error } = await supabase.rpc("create_customer_reservation", {
    p_cafe_id: cafe.id,
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
  return reservationId as string;
}
