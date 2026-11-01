import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getKathMenuAssets } from "@/lib/data/kath-menu-assets";
import { menuContacts } from "@/lib/menu/contacts";
import { getStandaloneHighlights } from "@/lib/data/standalone-highlights";
import { standaloneLogoVariant } from "@/lib/menu/logo-variants";
import { publishedMenuLogo } from "@/lib/cafe/published-logo";
import { normalizeSaudiPhone } from "@/lib/auth/phone-utils";
import { isGreenApiConfigured } from "@/lib/whatsapp/green-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { mapDbProductToMenuProduct, type DbMenuProduct } from "@/lib/data/mappers";
import { primaryMediaType } from "@/lib/menu/product-media";
import { giftProductAvailable } from "@/lib/commerce/storefront-cart";
import { isOwnedMenuAsset, isStandaloneProductVisible, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

const PRODUCT_COLUMNS = "id,cafe_id,category_id,legacy_category,name,description,price,price_options,catalog_kind,calories,preparation_time_minutes,ingredients,available,promo,image_url,image_storage_path,image_gallery,gallery_storage_paths,video_storage_path,media,image_variant,sort_order";
const PAGE_SIZE = 500;
const SHOWCASE_LOGO_WINDOW_MS = 20 * 60_000;

// Public preview gates run before this cache. Keys include tenant and the current uploaded path.
// The logo helper's <=30-minute memory age plus this <=20-minute window stays below its 1-hour URL lifetime.
const cachedShowcaseLogo = unstable_cache(async (cafeId: string, source: string, window: number) => {
  void window;
  return publishedMenuLogo(createAdminClient(), cafeId, source);
}, ["public-menu-showcase-logo-v1"], { revalidate: 1200 });

async function readMenuProducts(admin: ReturnType<typeof createAdminClient>, cafeId: string, branchId: string | null, commerce = false) {
  const rows: DbMenuProduct[] = [];
  // Keep explicit pagination: a large published menu must never be truncated.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = admin.from("menu_products").select(commerce ? `${PRODUCT_COLUMNS},commerce_details` : PRODUCT_COLUMNS)
      .eq("cafe_id", cafeId).is("deleted_at", null).order("sort_order").order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await (branchId ? query.eq("branch_id", branchId) : query.is("branch_id", null));
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as DbMenuProduct[]));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

function safeMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

/** Standalone catalog is a package service; no catalog/media work before authorization. */
export const getStandaloneMenu = cache(async (slug: string, showcase = false, branchSlug?: string): Promise<StandaloneMenu | null> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const admin = createAdminClient();
  const { data: cafe, error: cafeError } = await admin.from("cafes")
    .select("id,slug,name,status,business_category").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (cafeError) throw cafeError;
  if (!cafe || !["active", "published"].includes(String(cafe.status))) return null;
  const features = await getCafeFeatureCodes(String(cafe.id));
  if (!featureCodesAllow(features, "menu")) return null;

  if (branchSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branchSlug)) return null;
  const { data: branchRows, error: branchError } = await admin.from("branches").select("id,name,menu_slug,is_primary")
    .eq("cafe_id", cafe.id).eq("active", true).not("menu_slug", "is", null).is("deleted_at", null).order("sort_order").order("id");
  if (branchError) throw branchError;
  const chosenBranch = branchSlug ? branchRows?.find(row => row.menu_slug === branchSlug) : branchRows?.find(row => row.is_primary) ?? branchRows?.[0];
  if (branchSlug && !chosenBranch) return null;
  const branchId = chosenBranch?.id ?? null;
  const branchDto = (row: NonNullable<typeof branchRows>[number]) => ({ id: String(row.id), name: String(row.name), slug: String(row.menu_slug) });
  const categoryQuery = admin.from("menu_categories").select("id,name,description").eq("cafe_id", cafe.id)
    .eq("visible", true).is("deleted_at", null).order("sort_order").order("id");

  const [categoryResult, settingsResult, rawRows] = await Promise.all([
    branchId ? categoryQuery.eq("branch_id", branchId) : categoryQuery.is("branch_id", null),
    admin.from("cafe_settings").select("logo_url,logo_storage_path,description,instagram,whatsapp").eq("cafe_id", cafe.id).maybeSingle(),
    readMenuProducts(admin, String(cafe.id), branchId, cafe.business_category === "gifts_flowers"),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (settingsResult.error) throw settingsResult.error;
  const categories = categoryResult.data ?? [];
  const categoryNames = new Map(categories.map((category) => [String(category.id), String(category.name)]));
  const categoryIds = new Set(categoryNames.keys());
  // Gifts retain sold-out listings; deleted products and hidden categories never expose media.
  const rows = rawRows.filter(row => isStandaloneProductVisible(row, categoryIds, cafe.business_category === "gifts_flowers"));
  const mapped = rows.map((row) => mapDbProductToMenuProduct(row, categoryNames.get(row.category_id ?? "")));
  const paths = new Set<string>();
  for (const product of mapped) {
    for (const path of [product.imageAssetId, ...product.imageGallery!.map((item) => item.imageAssetId), ...product.media!.map((item) => item.assetId)]) {
      if (path && isOwnedMenuAsset(path, cafe.id)) paths.add(path);
    }
  }
  const settings = settingsResult.data;
  // Logo processing and product media are independent after the publication gate.
  const [signed, logoUrl] = await Promise.all([
    (async () => {
      const urls = new Map<string, string>();
      // Preview navigation reuses stable signatures rather than re-downloading unchanged images.
      // Only referenced, visible, tenant-owned assets reach this shared signing cache.
      if (paths.size) {
        const { data, error } = showcase || ["kat-coffe", "shahi-w-hail", "taza", "delicake"].includes(slug)
          ? { data: await getKathMenuAssets([...paths]), error: null }
          : await admin.storage.from("menu-products").createSignedUrls([...paths], 3600);
        if (error) throw error;
        for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
      }
      return urls;
    })(),
    (async () => {
      const variant = standaloneLogoVariant(cafe.id, settings?.logo_storage_path || settings?.logo_url);
      if (variant) return variant;
      let url = safeMediaUrl(settings?.logo_url);
      if (settings?.logo_storage_path && isOwnedMenuAsset(settings.logo_storage_path, cafe.id)) {
        url = (showcase
          ? await cachedShowcaseLogo(String(cafe.id), settings.logo_storage_path, Math.floor(Date.now() / SHOWCASE_LOGO_WINDOW_MS))
          : await publishedMenuLogo(admin, String(cafe.id), settings.logo_storage_path)) || url;
      }
      return url || "/brand/barndaksa-logo-brown.png";
    })(),
  ]);
  const resolve = (path?: string, url?: string | null) => (path ? signed.get(path) : null) || safeMediaUrl(url);
  const products: StandaloneMenuProduct[] = mapped.map((product) => {
    const images = [
      { url: resolve(product.imageAssetId, product.imageDataUrl), alt: product.name },
      ...product.imageGallery!.map((item) => ({ url: resolve(item.imageAssetId, item.imageDataUrl), alt: item.alt || product.name })),
      ...product.media!.filter((item) => item.type === "image").map((item) => ({ url: resolve(item.assetId, item.url), alt: item.alt || product.name })),
    ].filter((item): item is { url: string; alt: string } => Boolean(item.url));
    const videos = product.media!.filter((item) => item.type === "video")
      .map((item) => ({ url: resolve(item.assetId, item.url), alt: item.alt || product.name }))
      .filter((item): item is { url: string; alt: string } => Boolean(item.url));
    return {
      id: product.id, name: product.name, category: product.category, categoryId: product.categoryId,
      description: product.description, price: product.price, priceOptions: product.priceOptions, calories: product.calories,
      catalogKind: product.catalogKind,
      commerceDetails: product.commerceDetails,
      preparationTimeMinutes: product.preparationTimeMinutes, ingredients: product.ingredients,
      available: cafe.business_category === "gifts_flowers" ? giftProductAvailable(product) : product.available, promo: product.promo,
      primaryMediaType: product.media?.some((item) => item.primary) ? primaryMediaType(product) : undefined,
      images: images.filter((item, index) => images.findIndex((other) => other.url === item.url) === index), videos,
    };
  });
  const publishedIds = new Set(products.map((product) => product.id));
  for (const product of products) {
    if (product.promo?.kind === "منتج مجاني مع الطلب" && !publishedIds.has(product.promo.freeProductId ?? "")) product.promo = null;
  }
  const highlights = await getStandaloneHighlights(cafe.id, products, featureCodesAllow(features, "offers"), branchId).catch(() => {
    // An optional promotional surface must not take down the published catalog.
    console.error("Standalone highlights unavailable");
    return { asOf: Date.now(), items: [] };
  });
  return { branch: chosenBranch ? branchDto(chosenBranch) : null, branches: (branchRows ?? []).map(branchDto), businessCategory: cafe.business_category, cafeId: cafe.id, name: cafe.name, slug: cafe.slug, logoUrl, description: settings?.description ?? null, categories, products, highlights, loyaltyEnabled: featureCodesAllow(features, "loyalty"),
    contacts: { ...menuContacts(cafe.id, settings?.instagram), feedbackEnabled: Boolean(normalizeSaudiPhone(settings?.whatsapp ?? "") && isGreenApiConfigured()) } };
});
