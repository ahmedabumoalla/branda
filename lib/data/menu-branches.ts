import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertOwnerServiceEnabled } from "@/lib/data/owner-service-access";

export type MenuBranch = { id: string; name: string; slug: string; primary: boolean; active: boolean; lat: number | null; lng: number | null; address: string; city: string; welcomeMessage: string; usesBrandMenu: boolean; brandMenuRoot: boolean; updatedAt: string; sortOrder: number };

export function mapMenuBranch(row: Record<string, unknown>): MenuBranch {
  return { id: String(row.id), name: String(row.name), slug: String(row.menu_slug ?? ""), primary: Boolean(row.is_primary), active: Boolean(row.active), lat: row.lat == null ? null : Number(row.lat), lng: row.lng == null ? null : Number(row.lng), address: String(row.address ?? ""), city: String(row.city ?? ""), welcomeMessage: String(row.welcome_message ?? ""), usesBrandMenu: Boolean(row.uses_brand_menu), brandMenuRoot: Boolean(row.is_brand_menu_root), updatedAt: String(row.updated_at), sortOrder: Number(row.sort_order ?? 0) };
}

export async function getOwnerMenuBranches() {
  await assertOwnerServiceEnabled("menu");
  const cafe = await requireOwnerCafeContext("menu");
  // Scoped session reads retain branch RLS, including legacy branches without a slug
  const client = await createClient();
  const { data, error } = await client.from("branches").select("id,name,menu_slug,is_primary,active,lat,lng,address,city,welcome_message,uses_brand_menu,is_brand_menu_root,updated_at,sort_order")
    .eq("cafe_id", cafe.id).is("deleted_at", null).order("sort_order").order("id");
  if (error) throw error;
  return { cafe, branches: (data ?? []).map(mapMenuBranch) };
}
