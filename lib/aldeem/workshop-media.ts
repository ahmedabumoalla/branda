import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVENTORY_IMAGE_BUCKET, isInventoryImagePath } from "@/lib/finance/inventory-catalog";
import type { WorkshopSnapshot } from "./workshop";

/** Only enrich the stock identities returned by the authorized, branch-scoped workshop RPC. */
export async function workshopMedia(cafeId: string, snapshot: WorkshopSnapshot): Promise<WorkshopSnapshot> {
  const ids = [...new Set([...snapshot.products, ...snapshot.orders.flatMap(order => order.lines)].map(item => item.id))];
  const urls = new Map<string, string>();
  if (!ids.length) return snapshot;
  try {
    const admin = createAdminClient();
    for (let offset = 0; offset < ids.length; offset += 200) {
      const batch = ids.slice(offset, offset + 200);
      const { data, error } = await admin.from("bf_items").select("id,image_path").eq("cafe_id", cafeId).in("id", batch);
      if (error) continue;
      const owned = (data ?? []).filter(item => batch.includes(item.id) && isInventoryImagePath(item.image_path, cafeId));
      const paths = [...new Set(owned.map(item => item.image_path as string))];
      if (!paths.length) continue;
      const { data: signed } = await admin.storage.from(INVENTORY_IMAGE_BUCKET).createSignedUrls(paths, 600);
      const signatures = new Map((signed ?? []).filter(row => row.path && paths.includes(row.path) && row.signedUrl && !row.error).map(row => [row.path, row.signedUrl]));
      for (const item of owned) { const url = signatures.get(item.image_path); if (url) urls.set(item.id, url); }
    }
  } catch { /* A media failure must not prevent preparing an existing request. */ }
  return {
    ...snapshot,
    products: snapshot.products.map(item => ({ ...item, imageUrl: urls.get(item.id) ?? null })),
    orders: snapshot.orders.map(order => ({ ...order, lines: order.lines.map(item => ({ ...item, imageUrl: urls.get(item.id) ?? null })) })),
  };
}
