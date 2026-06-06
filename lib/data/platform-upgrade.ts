
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";

export type ReservationService = {
  id: string;
  name: string;
  description: string;
  price: number | null;
  isFree: boolean;
  maxGuests: number | null;
  availableSlots: string[];
  imageAssetId?: string;
  videoAssetId?: string;
  active: boolean;
  sortOrder: number;
};

export type VisitAnalytics = {
  totalVisits: number;
  uniqueSessions: number;
  repeatedVisits: number;
  averageDurationSeconds: number;
  orderConversions: number;
  reservationConversions: number;
  recent: Array<{ id: string; path: string; sessionId: string; durationSeconds: number | null; createdAt: string }>;
};

function mapService(row: Record<string, unknown>): ReservationService {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    isFree: Boolean(row.is_free),
    maxGuests: row.max_guests === null || row.max_guests === undefined ? null : Number(row.max_guests),
    availableSlots: Array.isArray(row.available_slots) ? row.available_slots.map(String) : [],
    imageAssetId: row.image_storage_path ? String(row.image_storage_path) : undefined,
    videoAssetId: row.video_storage_path ? String(row.video_storage_path) : undefined,
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export async function getOwnerReservationServices() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservation_services")
    .select("*")
    .eq("cafe_id", cafe.id)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapService);
}

export async function getPublicReservationServicesBySlug(slug: string) {
  const cafe = await getCafeBySlug(slug);
  if (!cafe) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("reservation_services")
    .select("*")
    .eq("cafe_id", cafe.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map(mapService);
}

const reservationServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  price: z.number().min(0).nullable().optional(),
  isFree: z.boolean(),
  maxGuests: z.number().int().positive().nullable().optional(),
  availableSlots: z.array(z.string()).default([]),
  imageAssetId: z.string().optional(),
  videoAssetId: z.string().optional(),
  active: z.boolean(),
  sortOrder: z.number().int().default(0),
});

export async function saveOwnerReservationService(input: z.infer<typeof reservationServiceSchema>) {
  const parsed = reservationServiceSchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_reservation_service", {
    p_service_id: parsed.id ?? null,
    p_name: parsed.name,
    p_description: parsed.description ?? "",
    p_price: parsed.isFree ? 0 : parsed.price ?? null,
    p_is_free: parsed.isFree,
    p_max_guests: parsed.maxGuests ?? null,
    p_available_slots: parsed.availableSlots,
    p_image_storage_path: parsed.imageAssetId ?? null,
    p_video_storage_path: parsed.videoAssetId ?? null,
    p_active: parsed.active,
    p_sort_order: parsed.sortOrder,
  });
  if (error) throw error;
  return String(data);
}

export async function setOwnerCustomerStatus(customerId: string, status: "active" | "suspended" | "blocked") {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_operational_status", {
    p_customer_id: customerId,
    p_status: status,
  });
  if (error) throw error;
}

export async function getOwnerVisitAnalytics(): Promise<VisitAnalytics> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("cafe_visit_events")
    .select("id, session_id, path, duration_seconds, converted_order, converted_reservation, repeated_visit, created_at")
    .eq("cafe_id", cafe.id)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = data ?? [];
  const unique = new Set(rows.map((row) => String(row.session_id))).size;
  const totalDuration = rows.reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0);
  return {
    totalVisits: rows.length,
    uniqueSessions: unique,
    repeatedVisits: rows.filter((row) => row.repeated_visit).length,
    averageDurationSeconds: rows.length ? Math.round(totalDuration / rows.length) : 0,
    orderConversions: rows.filter((row) => row.converted_order).length,
    reservationConversions: rows.filter((row) => row.converted_reservation).length,
    recent: rows.slice(0, 30).map((row) => ({
      id: String(row.id),
      path: String(row.path),
      sessionId: String(row.session_id),
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      createdAt: String(row.created_at),
    })),
  };
}

export async function trackCafeVisit(input: {
  slug: string;
  sessionId: string;
  path: string;
  referrer?: string;
  durationSeconds?: number;
}) {
  const supabase = await createClient();
  await supabase.rpc("track_cafe_visit", {
    p_slug: input.slug,
    p_session_id: input.sessionId,
    p_path: input.path,
    p_referrer: input.referrer ?? null,
    p_duration_seconds: input.durationSeconds ?? null,
  });
}
