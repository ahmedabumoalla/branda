import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnedMenuAsset, type StandaloneHighlight, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

/** Called only after the standalone menu publication gate, with its resolved tenant. */
export async function getStandaloneHighlights(cafeId: string, products: StandaloneMenuProduct[]) {
  const asOf = Date.now();
  const today = new Date(asOf + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const admin = createAdminClient();
  const { data, error } = await admin.from("offers")
    .select("id,title,description,offer_type,discount_percent,code,linked_product_id,banner_storage_path,card_storage_path,end_date")
    .eq("cafe_id", cafeId).eq("visible_in_cafe", true).eq("is_archived", false).is("deleted_at", null)
    .in("status", ["active", "scheduled", "published"])
    .in("placement", ["بانر الكوفي", "كلاهما", "banner", "both"])
    .or(`start_date.is.null,start_date.lte.${today}`).or(`end_date.is.null,end_date.gte.${today}`)
    .order("created_at", { ascending: false }).order("id").limit(24);
  if (error) throw error;
  const publishedProducts = new Map(products.filter((product) => product.available).map((product) => [product.id, product]));
  // Hidden, deleted, unavailable or foreign linked products must never be promoted.
  const rows = (data ?? []).filter((row) => !row.linked_product_id || publishedProducts.has(row.linked_product_id)).slice(0, 6);
  const paths = rows.map((row) => {
    const candidates = [row.card_storage_path, row.banner_storage_path];
    return candidates.find((path) => path && isOwnedMenuAsset(path, cafeId) && path.startsWith(`${cafeId}/${row.id}/`)) ?? null;
  });
  const signed = new Map<string, string>();
  const ownedPaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (ownedPaths.length) {
    const { data: assets, error: storageError } = await admin.storage.from("offer-banners").createSignedUrls(ownedPaths, 3600);
    if (storageError) throw storageError;
    for (const asset of assets ?? []) if (asset.path && asset.signedUrl && !asset.error) signed.set(asset.path, asset.signedUrl);
  }
  const items: StandaloneHighlight[] = rows.map((row, index) => ({
    id: row.id, title: row.title, description: row.description,
    imageUrl: (paths[index] ? signed.get(paths[index]!) : null) || publishedProducts.get(row.linked_product_id ?? "")?.images[0]?.url || null,
    productId: row.linked_product_id, code: row.code,
    discountPercent: row.offer_type === "خصم" && Number(row.discount_percent) > 0 && Number(row.discount_percent) <= 100 ? Number(row.discount_percent) : null,
    expiresAt: row.end_date ? new Date(`${row.end_date}T23:59:59.999+03:00`).getTime() : null,
  }));
  return { asOf, items };
}
