import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";

export type MenuBranch = { id: string; name: string; slug: string; primary: boolean; active: boolean };

export async function getOwnerMenuBranches() {
  await assertOwnerServiceEnabled("menu");
  const cafe = await requireOwnerCafeContext();
  const client = await createClient();
  const { data, error } = await client.from("branches").select("id,name,menu_slug,is_primary,active")
    .eq("cafe_id", cafe.id).not("menu_slug", "is", null).is("deleted_at", null).order("sort_order").order("id");
  if (error) throw error;
  return { cafe, branches: (data ?? []).map(row => ({ id: String(row.id), name: String(row.name), slug: String(row.menu_slug), primary: Boolean(row.is_primary), active: Boolean(row.active) })) as MenuBranch[] };
}
