import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOwnedMenuAsset } from "@/lib/menu/standalone-menu";
import type { FinanceProduct } from "./brand-finance";

type StoredProduct = FinanceProduct & { imageStoragePath?: string | null };
const signatures = new Map<string, { url: string; refreshAt: number }>();

/** Call only after the current request has authorized the finance snapshot. */
export async function financeProductMedia(cafe: { id: string; slug: string }, products: StoredProduct[]): Promise<FinanceProduct[]> {
  const paths = [...new Set(products.flatMap(product => product.imageStoragePath && isOwnedMenuAsset(product.imageStoragePath, cafe.id) ? [product.imageStoragePath] : []))];
  const now = Date.now();
  for (const [path, signature] of signatures) if (signature.refreshAt <= now) signatures.delete(path);
  const missing = paths.filter(path => !signatures.has(path));
  // Cache only short-lived image signatures, never authorization or financial data.
  try {
    for (let offset = 0; offset < missing.length; offset += 200) {
      const batch = missing.slice(offset, offset + 200);
      const { data } = await createAdminClient().storage.from("menu-products").createSignedUrls(batch, 600);
      for (const row of data ?? []) if (row.path && batch.includes(row.path) && row.signedUrl && !row.error) {
        signatures.set(row.path, { url: row.signedUrl, refreshAt: now + 240_000 });
      }
    }
  } catch { /* The existing authenticated media route remains the fallback. */ }
  const result = products.map(({ imageStoragePath, ...product }) => {
    if (!imageStoragePath) return product;
    if (!isOwnedMenuAsset(imageStoragePath, cafe.id)) return { ...product, imageUrl: null, imageFallbackUrl: null };
    const fallback = `/api/finance/${encodeURIComponent(cafe.slug)}/media?path=${encodeURIComponent(imageStoragePath)}`;
    return { ...product, imageUrl: signatures.get(imageStoragePath)?.url ?? fallback, imageFallbackUrl: fallback };
  });
  while (signatures.size > 2000) signatures.delete(signatures.keys().next().value!);
  return result;
}
