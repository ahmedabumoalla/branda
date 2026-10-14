import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnedMenuAsset, type StandaloneHighlight, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";
import { matchesLegacyOfferPromo } from "@/lib/offers/published-offers";

/** Called only after the standalone menu publication gate, with its resolved tenant. */
export async function getStandaloneHighlights(cafeId: string, products: StandaloneMenuProduct[], enabled = true) {
  const asOf = Date.now();
  const today = new Date(asOf + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const admin = createAdminClient();
  const legacyProducts = products.filter((product) => product.promo?.kind === "خصم" && product.promo.discountMode === "percent");
  const managedProductIds = new Set<string>();
  // Older saves copied an offer into the product promo field without a source ID
  // Only an exact fingerprint is treated as managed so independent promos survive
  if (legacyProducts.length) {
    for (let offset = 0; ; offset += 500) {
      const { data: historical, error: historyError } = await admin.from("offers")
        .select("linked_product_id,title,discount_percent,start_date,end_date,created_at")
        .eq("cafe_id", cafeId).in("linked_product_id", legacyProducts.map((product) => product.id))
        .order("id").range(offset, offset + 499);
      if (historyError) throw historyError;
      for (const row of historical ?? []) {
        const product = legacyProducts.find((item) => item.id === row.linked_product_id);
        if (product && matchesLegacyOfferPromo(product, row)) managedProductIds.add(product.id);
      }
      if ((historical?.length ?? 0) < 500) break;
    }
  }
  if (!enabled) return { asOf, items: [] as StandaloneHighlight[], managedProductIds: [...managedProductIds] };
  const query = () => admin.from("offers")
    .select("id,title,description,offer_type,target_type,offer_rules,discount_percent,code,linked_product_id,banner_storage_path,card_storage_path,end_date,placement")
    .eq("cafe_id", cafeId).eq("visible_in_cafe", true).eq("is_archived", false).is("deleted_at", null)
    .in("status", ["active", "scheduled", "published"])
    .or(`start_date.is.null,start_date.lte.${today}`).or(`end_date.is.null,end_date.gte.${today}`)
    .order("created_at", { ascending: false }).order("id");
  const first = await query().range(0, 499);
  if (first.error) throw first.error;
  const data = [...(first.data ?? [])];
  for (let offset = 500; data.length === offset; offset += 500) {
    const page = await query().range(offset, offset + 499);
    if (page.error) throw page.error;
    data.push(...(page.data ?? []));
  }
  const publishedProducts = new Map(products.filter((product) => product.available).map((product) => [product.id, product]));
  const linkedIds = (row: (typeof data)[number]): string[] => [...new Set<string>([
    ...(Array.isArray(row.offer_rules?.selectedProductIds) ? row.offer_rules.selectedProductIds : []),
    row.linked_product_id, row.offer_rules?.buyProductId, row.offer_rules?.freeProductId,
  ].filter((id): id is string => typeof id === "string" && Boolean(id)))];
  // Hidden, deleted, unavailable or foreign linked products must never be promoted.
  const rows = (data ?? []).filter((row) => {
    const rules = row.offer_rules ?? {};
    if (rules.buyProductId && !publishedProducts.has(rules.buyProductId)) return false;
    if (rules.freeProductId && !publishedProducts.has(rules.freeProductId)) return false;
    const ids = linkedIds(row);
    return !ids.length || ids.some((id) => publishedProducts.has(id));
  });
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
  const items: StandaloneHighlight[] = rows.flatMap((row, index) => {
    const rules = row.offer_rules ?? {};
    const kind = rules.rastKind === "event" || row.target_type === "experience_campaign" ? "event"
      : rules.appliesToAllProducts || rules.rastKind === "general" || (!linkedIds(row).length && row.offer_type === "خصم") ? "general" : "products";
    const productIds = kind === "products" ? linkedIds(row).filter((id) => publishedProducts.has(id)) : [];
    if (kind === "products" && linkedIds(row).length && !productIds.length) return [];
    const eventDate = kind === "event" && typeof rules.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rules.eventDate) ? rules.eventDate : undefined;
    const expiryDate = [row.end_date, eventDate].filter(Boolean).sort()[0];
    if (expiryDate && expiryDate < today) return [];
    return (productIds.length ? productIds : [null]).map((productId, productIndex) => ({
      id: productIndex ? `${row.id}:${productId}` : row.id, kind,
      showInSpotlight: ["بانر الكوفي", "كلاهما", "banner", "both"].includes(row.placement),
      offerType: row.offer_type,
      freeProductId: publishedProducts.has(rules.freeProductId) ? rules.freeProductId : undefined,
      buyProductId: publishedProducts.has(rules.buyProductId) ? rules.buyProductId : undefined,
      buyQuantity: Number.isInteger(Number(rules.buyQuantity)) && Number(rules.buyQuantity) > 0 ? Number(rules.buyQuantity) : undefined,
      rewardQuantity: Number.isInteger(Number(rules.rewardQuantity)) && Number(rules.rewardQuantity) > 0 ? Number(rules.rewardQuantity) : undefined,
      title: row.title, description: row.description || (typeof rules.packageDescription === "string" ? rules.packageDescription : ""),
      productName: productId ? publishedProducts.get(productId)?.name : undefined,
      imageUrl: (productIds.length > 1 && productId ? publishedProducts.get(productId)?.images[0]?.url : null) || (paths[index] ? signed.get(paths[index]!) : null) || publishedProducts.get(productId ?? "")?.images[0]?.url || null,
      productId, code: kind === "event" ? null : row.code,
      discountPercent: kind !== "event" && row.offer_type === "خصم" && Number(row.discount_percent) > 0 && Number(row.discount_percent) <= 100 ? Number(row.discount_percent) : null,
      expiresAt: expiryDate ? new Date(`${expiryDate}T23:59:59.999+03:00`).getTime() : null,
      eventDate, eventTime: kind === "event" && typeof rules.eventTime === "string" ? rules.eventTime : undefined,
      eventLocation: kind === "event" && typeof rules.eventLocation === "string" ? rules.eventLocation.slice(0, 160) : undefined,
    }));
  });
  return { asOf, items, managedProductIds: [...managedProductIds] };
}
