import "server-only";

import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { brandCountryFilterSchema } from "@/lib/admin/brand-country-filter";
import { getAdminBrandCountries } from "@/lib/data/admin-brand-countries";

const timestamp = z.string().datetime({ offset: true });
const rowSchema = z.object({
  brand_id: z.string().uuid(),
  brand_name: z.string(),
  owner_phone: z.string().nullable(),
  joined_at: timestamp,
  account_status: z.string(),
  handoff_status: z.string(),
  trial_state: z.string(),
  trial_started_at: timestamp.nullable(),
  trial_days: z.number().int().nonnegative().nullable(),
  last_activity: z.string().nullable(),
  last_activity_at: timestamp.nullable(),
  active_plan_names: z.string(),
  subscription_expires_at: timestamp.nullable(),
  issued_card_count: z.number().int().nonnegative(),
  stamp_operation_count: z.number().int().nonnegative(),
  menu_visitor_count: z.number().int().nonnegative().nullable(),
  dashboard_login_count: z.number().int().nonnegative(),
  menu_tracking_since: timestamp.nullable(),
  stamp_tracking_since: timestamp.nullable(),
});

export type BrandContactRow = z.infer<typeof rowSchema>;
export type BrandContactReport = { rows: BrandContactRow[]; exportedAt: string };

export async function getBrandContactReport(countryInput = ""): Promise<BrandContactReport> {
  await requirePlatformAdmin();
  const country = brandCountryFilterSchema.parse(countryInput);
  const client = await createClient();
  const exportedAt = new Date().toISOString();
  const rows: BrandContactRow[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = client.rpc("admin_brand_contact_report_v2").lte("joined_at", exportedAt)
      .order("brand_id", { ascending: true }).limit(500);
    if (cursor !== null) query = query.gt("brand_id", cursor);
    const result = await query;
    if (result.error?.code === "42501") throw new Error("Forbidden: active platform admin required");
    if (result.error?.code === "PGRST202") throw new Error("Brand contact report not installed");
    if (result.error) throw new Error("Unable to read brand contact report");
    const batch = z.array(rowSchema).parse(result.data);
    if (!batch.length) {
      if (!country) return { exportedAt, rows };
      const countries = await getAdminBrandCountries(client, rows.map(row => row.brand_id));
      return { exportedAt, rows: rows.filter(row => countries.get(row.brand_id) === country) };
    }
    for (const row of batch) {
      if (cursor !== null && row.brand_id <= cursor) throw new Error("Brand report pagination did not advance");
      rows.push(row);
      cursor = row.brand_id;
    }
  }
}
