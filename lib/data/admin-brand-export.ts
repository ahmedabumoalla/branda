import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export type AdminBrandExportSubscription = {
  id: string;
  created_at: string;
  status: string;
  activation_source: string | null;
  plan_id: string;
  plan_name_snapshot: string | null;
  started_at: string | null;
  expires_at: string | null;
  amount_sar: number | null;
  platform_plans: { active: boolean } | null;
};

export type AdminBrandExportBrand = {
  id: string;
  name: string;
  createdAt: string;
  accountStatus: string;
  subscriptions: AdminBrandExportSubscription[];
};

export type AdminBrandExportSnapshot = {
  exportedAt: string;
  brands: AdminBrandExportBrand[];
};

const PAGE_SIZE = 500;
const BRAND_BATCH_SIZE = 100;
const BRAND_COLUMNS = "id,name,status,created_at";
const SUBSCRIPTION_COLUMNS = "id,cafe_id,created_at,status,activation_source,plan_id,plan_name_snapshot,started_at,expires_at,amount_sar,platform_plans(active)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
type Cursor = { id: string; createdAt: string };

function readCursor(row: Record<string, unknown>): Cursor {
  const id = String(row.id ?? "");
  const createdAt = String(row.created_at ?? "");
  if (!UUID.test(id) || !TIMESTAMP.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error("Invalid brand export pagination data");
  }
  // Preserve database microseconds; Date.toISOString() would truncate cursor precision.
  return { id, createdAt };
}

function cursorFilter(cursor: Cursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** Fresh, minimal administrative export. No owner/customer payloads or mutation side effects. */
export async function getAdminBrandExportSnapshot(): Promise<AdminBrandExportSnapshot> {
  const actor = await requirePlatformAdmin();
  const client = await createClient();
  // The shared role guard does not currently check suspended administrator profiles.
  const profile = await client.from("profiles").select("role,status").eq("id", actor.id).maybeSingle();
  if (profile.error || profile.data?.role !== "platform_admin" || profile.data.status !== "active") {
    throw new Error("Forbidden: active platform admin required");
  }
  const exportedAt = new Date().toISOString();
  const brands: AdminBrandExportBrand[] = [];
  const brandIds = new Set<string>();
  let cursor: Cursor | null = null;
  // Keyset pagination does not skip rows when an earlier row is deleted mid-export.
  for (;;) {
    let query = client.from("cafes").select(BRAND_COLUMNS).is("deleted_at", null)
      .lte("created_at", exportedAt).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(PAGE_SIZE);
    if (cursor) query = query.or(cursorFilter(cursor));
    const result = await query;
    if (result.error || !Array.isArray(result.data)) throw new Error("Unable to read brand export data");
    if (!result.data.length) break;
    for (const row of result.data as Record<string, unknown>[]) {
      const next = readCursor(row);
      if (brandIds.has(next.id)) throw new Error("Brand export pagination did not advance");
      brandIds.add(next.id);
      brands.push({ id: next.id, name: String(row.name ?? ""), createdAt: next.createdAt,
        accountStatus: String(row.status ?? ""), subscriptions: [] });
      cursor = next;
    }
  }

  // Read subscriptions separately so embedded relation row limits cannot hide history.
  for (let offset = 0; offset < brands.length; offset += BRAND_BATCH_SIZE) {
    const batch = brands.slice(offset, offset + BRAND_BATCH_SIZE);
    const byId = new Map(batch.map(brand => [brand.id, brand]));
    const seen = new Set<string>();
    cursor = null;
    for (;;) {
      let query = client.from("subscriptions").select(SUBSCRIPTION_COLUMNS).in("cafe_id", [...byId.keys()])
        .lte("created_at", exportedAt).order("created_at", { ascending: false })
        .order("id", { ascending: false }).limit(PAGE_SIZE);
      if (cursor) query = query.or(cursorFilter(cursor));
      const result = await query;
      if (result.error || !Array.isArray(result.data)) throw new Error("Unable to read brand subscription export data");
      if (!result.data.length) break;
      for (const row of result.data as Record<string, unknown>[]) {
        const next = readCursor(row);
        const brand = byId.get(String(row.cafe_id));
        if (!brand || seen.has(next.id)) throw new Error("Invalid brand subscription export scope");
        seen.add(next.id);
        const plan = row.platform_plans as { active?: unknown } | null;
        const amount = row.amount_sar === null || row.amount_sar === undefined ? null : Number(row.amount_sar);
        brand.subscriptions.push({ id: next.id, created_at: next.createdAt, status: String(row.status ?? ""),
          activation_source: nullableText(row.activation_source), plan_id: String(row.plan_id ?? ""),
          plan_name_snapshot: nullableText(row.plan_name_snapshot), started_at: nullableText(row.started_at),
          expires_at: nullableText(row.expires_at), amount_sar: amount !== null && Number.isFinite(amount) ? amount : null,
          platform_plans: plan ? { active: plan.active === true } : null });
        cursor = next;
      }
    }
  }
  return { exportedAt, brands };
}
