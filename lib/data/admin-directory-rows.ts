import "server-only";
import type { createClient } from "@/lib/supabase/server";

/** Enumerate the whole directory before country filtering, retaining stable newest-first order */
export async function getAdminDirectoryRows(client: Awaited<ReturnType<typeof createClient>>, cafeId?: string) {
  const rows: Record<string, unknown>[] = [];
  let cursor: { id: string; createdAt: string } | null = null;
  for (;;) {
    let query = client.from("cafes").select("*,cafe_settings(*),cafe_members(user_id,role,profiles(email,full_name))")
      .is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500);
    if (cafeId) query = query.eq("id", cafeId);
    if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (!/^[0-9a-f-]{36}$/i.test(row.id) || !/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(row.created_at)) throw new Error("Invalid directory cursor");
      if (cursor && (row.created_at > cursor.createdAt || (row.created_at === cursor.createdAt && row.id >= cursor.id))) throw new Error("Directory pagination did not advance");
      rows.push(row);
      cursor = { id: row.id, createdAt: row.created_at };
    }
    if (cafeId) break;
  }
  return rows;
}
