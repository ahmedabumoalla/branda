import "server-only";

import { cache } from "react";
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
import { isOwnedMenuAsset, isStandaloneProductVisible, type StandaloneMenu, type StandaloneMenuProduct } from "@/lib/menu/standalone-menu";

const PRODUCT_COLUMNS = "id,cafe_id,category_id,legacy_category,name,description,price,calories,preparation_time_minutes,ingredients,available,promo,image_url,image_storage_path,image_gallery,gallery_storage_paths,video_storage_path,media,image_variant,sort_order";
const PAGE_SIZE = 500;

function safeMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

/** Standalone catalog is a package service; no catalog/media work before authorization. */
export const getStandaloneMenu = cache(async (slug: string): Promise<StandaloneMenu | null> => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const admin = createAdminClient();
  const { data: cafe, error: cafeError } = await admin.from("cafes")
    .select("id,slug,name,status").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (cafeError) throw cafeError;
  if (!cafe || !["active", "published"].includes(String(cafe.status))) return null;
  const features = await getCafeFeatureCodes(String(cafe.id));
  if (!featureCodesAllow(features, "menu")) return null;

  const [categoryResult, settingsResult] = await Promise.all([
    admin.from("menu_categories").select("id,name,description").eq("cafe_id", cafe.id)
      .eq("visible", true).is("deleted_at", null).order("sort_order").order("id"),
    admin.from("cafe_settings").select("logo_url,logo_storage_path,description,instagram,whatsapp").eq("cafe_id", cafe.id).maybeSingle(),
  ]);
  if (categoryResult.error) throw categoryResult.error;
  if (settingsResult.error) throw settingsResult.error;
  const categories = categoryResult.data ?? [];
  const categoryNames = new Map(categories.map((category) => [String(category.id), String(category.name)]));
  const categoryIds = new Set(categoryNames.keys());
  const rows: DbMenuProduct[] = [];
  // Explicit pagination prevents PostgREST's row cap from silently truncating a menu.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.from("menu_products").select(PRODUCT_COLUMNS)
      .eq("cafe_id", cafe.id).is("deleted_at", null).order("sort_order").order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as DbMenuProduct[]).filter((row) => isStandaloneProductVisible(row, categoryIds)));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  const mapped = rows.map((row) => mapDbProductToMenuProduct(row, categoryNames.get(row.category_id ?? "")));
  const paths = new Set<string>();
  for (const product of mapped) {
    for (const path of [product.imageAssetId, ...product.imageGallery!.map((item) => item.imageAssetId), ...product.media!.map((item) => item.assetId)]) {
      if (path && isOwnedMenuAsset(path, cafe.id)) paths.add(path);
    }
  }
  const signed = new Map<string, string>();
  // Only assets referenced by this published menu and isolated to its tenant are signed.
  if (paths.size) {
    const { data, error } = await admin.storage.from("menu-products").createSignedUrls([...paths], 3600);
    if (error) throw error;
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) signed.set(item.path, item.signedUrl);
  }
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
      description: product.description, price: product.price, calories: product.calories,
      preparationTimeMinutes: product.preparationTimeMinutes, ingredients: product.ingredients,
      available: product.available, promo: product.promo,
      images: images.filter((item, index) => images.findIndex((other) => other.url === item.url) === index), videos,
    };
  });
  const settings = settingsResult.data;
  let logoUrl = safeMediaUrl(settings?.logo_url);
  if (settings?.logo_storage_path && isOwnedMenuAsset(settings.logo_storage_path, cafe.id)) {
    logoUrl = await publishedMenuLogo(admin, String(cafe.id), settings.logo_storage_path) || logoUrl;
  }
  logoUrl = standaloneLogoVariant(cafe.id, settings?.logo_storage_path || settings?.logo_url) || logoUrl || "/brand/barndaksa-logo-brown.png";
  const highlights = cafe.slug === "rast" && featureCodesAllow(features, "offers") ? await getStandaloneHighlights(cafe.id, products).catch(() => {
    // An optional promotional surface must not take down the published catalog.
    console.error("Standalone highlights unavailable");
    return { asOf: Date.now(), items: [] };
  }) : undefined;
  return { name: cafe.name, slug: cafe.slug, logoUrl, description: settings?.description ?? null, categories, products, highlights, loyaltyEnabled: featureCodesAllow(features, "loyalty"),
    contacts: { ...menuContacts(cafe.id, settings?.instagram), feedbackEnabled: Boolean(normalizeSaudiPhone(settings?.whatsapp ?? "") && isGreenApiConfigured()) } };
});
