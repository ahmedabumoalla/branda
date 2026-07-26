import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { recordPublicCafeVisit } from "@/lib/data/operation-events";


export type VisitAnalytics = {
  totalVisits: number;
  uniqueSessions: number;
  repeatedVisits: number;
  averageDurationSeconds: number;
  orderConversions: number;
  recent: Array<{ id: string; path: string; sessionId: string; durationSeconds: number | null; createdAt: string }>;
};

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
    .select("id, session_id, path, duration_seconds, converted_order, repeated_visit, created_at")
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
  await recordPublicCafeVisit(input);
}
