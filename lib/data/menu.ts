import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext, getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";
import {
  mapDbCategoryToRecord,
  mapDbProductToMenuProduct,
  type DbMenuCategory,
  type DbMenuProduct,
} from "@/lib/data/mappers";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { EventTicketSettings, MenuProduct } from "@/lib/mock/menu";

function invalidatePublicMenuSurfaces(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();

  clearServerMemoryCache(`public-menu:${normalizedSlug}`);
  clearServerMemoryCache(`public-cafe-fast:${normalizedSlug}`);
  revalidatePath(`/c/${normalizedSlug}`);
  revalidatePath(`/c/${normalizedSlug}/products/latest`);
  revalidatePath(`/c/${normalizedSlug}/products/popular`);
  revalidatePath(`/c/${normalizedSlug}/products/offers`);
}

type DbEventTicketSetting = {
  product_id: string;
  event_start_at: string | null;
  event_end_at: string | null;
  venue_name: string | null;
  gate_name: string | null;
  capacity: number | null;
  ticket_type: string | null;
  ticket_valid_from: string | null;
  ticket_valid_until: string | null;
  max_per_customer: number | null;
  checkin_policy: "single_use" | "multi_use" | null;
};

function mapEventTicketSetting(row: DbEventTicketSetting): EventTicketSettings {
  return {
    eventStartAt: row.event_start_at,
    eventEndAt: row.event_end_at,
    venueName: row.venue_name,
    gateName: row.gate_name,
    capacity: row.capacity == null ? null : Number(row.capacity),
    ticketType: row.ticket_type,
    ticketValidFrom: row.ticket_valid_from,
    ticketValidUntil: row.ticket_valid_until,
    maxPerCustomer: row.max_per_customer == null ? null : Number(row.max_per_customer),
    checkinPolicy: row.checkin_policy ?? "single_use",
  };
}

async function attachEventTicketSettings(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>,
  cafeId: string,
  products: MenuProduct[]
) {
  if (!products.length) return products;

  const productIds = products.map((product) => product.id);
  const { data, error } = await supabase
    .from("event_ticket_settings")
    .select("*")
    .eq("cafe_id", cafeId)
    .in("product_id", productIds);

  if (error) {
    if (error.code === "42P01") return products;
    throw error;
  }

  const settingsByProductId = new Map(
    ((data ?? []) as DbEventTicketSetting[]).map((row) => [
      row.product_id,
      mapEventTicketSetting(row),
    ])
  );

  return products.map((product) => ({
    ...product,
    eventTicketSettings: settingsByProductId.get(product.id) ?? product.eventTicketSettings ?? null,
  }));
}

export async function getPublicMenuBySlug(slug: string) {
  const cafe = await getPublicCafeBySlugAdmin(slug);
  if (!cafe) return { categories: [] as MenuCategoryRecord[], products: [] as MenuProduct[] };

  const supabase = createAdminClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("visible", true)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select("*")
      .eq("cafe_id", cafe.id)
      .eq("available", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const categoryRows = (categories ?? []) as DbMenuCategory[];
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));

  const mappedProducts = ((products ?? []) as DbMenuProduct[]).map((p) =>
    mapDbProductToMenuProduct(p, p.category_id ? categoryMap.get(p.category_id) : undefined)
  );

  return {
    categories: categoryRows.map((c) => mapDbCategoryToRecord(slug, c)),
    products: await attachEventTicketSettings(supabase, cafe.id, mappedProducts),
  };
}

export async function getOwnerMenu() {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("*")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select("*")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  const categoryRows = (categories ?? []) as DbMenuCategory[];
  const categoryMap = new Map(categoryRows.map((c) => [c.id, c.name]));

  const mappedProducts = ((products ?? []) as DbMenuProduct[]).map((p) =>
    mapDbProductToMenuProduct(p, p.category_id ? categoryMap.get(p.category_id) : undefined)
  );

  return {
    cafe,
    categories: categoryRows.map((c) => mapDbCategoryToRecord(cafe.slug, c)),
    products: await attachEventTicketSettings(supabase, cafe.id, mappedProducts),
  };
}

const productGalleryItemSchema = z.object({
  type: z.enum(["image", "video"]).optional(),
  assetId: z.string().optional(),
  imageAssetId: z.string().optional(),
  videoAssetId: z.string().optional(),
  imageDataUrl: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  alt: z.string().optional(),
  mimeType: z.string().optional(),
});

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  categoryId: z.string().uuid().optional().nullable(),
  category: z.string().optional(),
  description: z.string(),
  price: z.number().min(0),
  calories: z.number().optional().nullable(),
  loyaltyPoints: z.number().int().min(0),
  preparationTimeMinutes: z.number().optional().nullable(),
  redeemableWithPoints: z.boolean(),
  redemptionPoints: z.number().optional().nullable(),
  availableForPickup: z.boolean(),
  pickupLeadTimeMinutes: z.number().optional().nullable(),
  ingredients: z.array(z.string()),
  available: z.boolean(),
  imageVariant: z.string(),
  imageStoragePath: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  imageGallery: z.array(productGalleryItemSchema).optional().default([]),
  videoStoragePath: z.string().optional().nullable(),
  media: z.array(z.object({
    type: z.enum(["image", "video"]),
    assetId: z.string().optional(),
    url: z.string().optional().nullable(),
    alt: z.string().optional(),
    mimeType: z.string().optional(),
  })).optional().default([]),
  promo: z.unknown().optional().nullable(),
  eventTicketSettings: z.object({
    eventStartAt: z.string().optional().nullable(),
    eventEndAt: z.string().optional().nullable(),
    venueName: z.string().optional().nullable(),
    gateName: z.string().optional().nullable(),
    capacity: z.number().int().nonnegative().optional().nullable(),
    ticketType: z.string().optional().nullable(),
    ticketValidFrom: z.string().optional().nullable(),
    ticketValidUntil: z.string().optional().nullable(),
    maxPerCustomer: z.number().int().positive().optional().nullable(),
    checkinPolicy: z.enum(["single_use", "multi_use"]).optional().default("single_use"),
  }).optional().nullable(),
});

type MenuProductPayload = {
  cafe_id: string;
  category_id: string | null;
  legacy_category: string | null;
  name: string;
  description: string;
  price: number;
  calories: number | null;
  loyalty_points: number;
  preparation_time_minutes: number | null;
  redeemable_with_points: boolean;
  redemption_points: number | null;
  available_for_pickup: boolean;
  pickup_lead_minutes: number | null;
  ingredients: string[];
  available: boolean;
  image_variant: string;
  image_storage_path: string | null;
  image_url: string | null;
  image_gallery: NonNullable<MenuProduct["imageGallery"]>;
  gallery_storage_paths: string[];
  video_storage_path: string | null;
  media: NonNullable<MenuProduct["media"]>;
  promo: unknown;
};

function persistableUrl(value?: string | null) {
  if (!value) return null;
  return value.startsWith("http://") || value.startsWith("https://") ? value : null;
}

function normalizeProductImageGallery(
  gallery: z.infer<typeof productGalleryItemSchema>[]
): NonNullable<MenuProduct["imageGallery"]> {
  return gallery
    .map((item) => {
      const assetId = item.assetId?.trim() || undefined;
      const imageAssetId = item.imageAssetId?.trim() || undefined;
      const videoAssetId = item.videoAssetId?.trim() || undefined;
      const type: "image" | "video" =
        item.type === "video" || videoAssetId ? "video" : "image";

      if (type === "video") {
        const videoPath = videoAssetId ?? assetId;
        return {
          type,
          assetId: videoPath,
          videoAssetId: videoPath,
          imageDataUrl: null,
          alt: item.alt?.trim() || undefined,
          mimeType: item.mimeType?.trim() || undefined,
        };
      }

      const imagePath = imageAssetId ?? assetId;
      return {
        type,
        assetId: imagePath,
        imageAssetId: imagePath,
        imageDataUrl: persistableUrl(item.imageDataUrl ?? item.url),
        alt: item.alt?.trim() || undefined,
      };
    })
    .filter((item) => item.imageAssetId || item.videoAssetId || item.imageDataUrl);
}

function normalizeProductMedia(
  media: NonNullable<z.infer<typeof productSchema>["media"]>
): NonNullable<MenuProduct["media"]> {
  return media
    .map((item) => ({
      type: item.type,
      assetId: item.assetId?.trim() || undefined,
      url: persistableUrl(item.url),
      alt: item.alt?.trim() || undefined,
      mimeType: item.mimeType?.trim() || undefined,
    }))
    .filter((item) => item.assetId || item.url);
}

function mergeProductGalleryItems(
  gallery: NonNullable<MenuProduct["imageGallery"]>
): NonNullable<MenuProduct["imageGallery"]> {
  const seen = new Set<string>();
  return gallery.filter((item) => {
    const key = item.videoAssetId
      ? `video:${item.videoAssetId}`
      : item.imageAssetId
        ? `image:${item.imageAssetId}`
        : item.imageDataUrl
          ? `image-url:${item.imageDataUrl}`
          : "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function galleryStoragePaths(gallery: NonNullable<MenuProduct["imageGallery"]>) {
  return gallery
    .map((item) => item.imageAssetId?.trim() || item.assetId?.trim())
    .filter((path): path is string => Boolean(path));
}

function nullIfBlank(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

async function upsertEventTicketSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cafeId: string,
  productId: string,
  settings: EventTicketSettings | null | undefined
) {
  const payload = {
    product_id: productId,
    cafe_id: cafeId,
    event_start_at: nullIfBlank(settings?.eventStartAt),
    event_end_at: nullIfBlank(settings?.eventEndAt),
    venue_name: nullIfBlank(settings?.venueName),
    gate_name: nullIfBlank(settings?.gateName),
    capacity: settings?.capacity ?? null,
    ticket_type: nullIfBlank(settings?.ticketType) ?? "general_admission",
    ticket_valid_from: nullIfBlank(settings?.ticketValidFrom),
    ticket_valid_until: nullIfBlank(settings?.ticketValidUntil),
    max_per_customer: settings?.maxPerCustomer ?? null,
    checkin_policy: settings?.checkinPolicy ?? "single_use",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("event_ticket_settings")
    .upsert(payload, { onConflict: "product_id" });

  if (error) throw error;
}

export async function upsertMenuProduct(input: z.infer<typeof productSchema>) {
  const parsed = productSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const imageGallery = normalizeProductImageGallery(parsed.imageGallery ?? []);
  const requestedVideoStoragePath = parsed.videoStoragePath?.trim() || undefined;
  const media = normalizeProductMedia([
    ...(requestedVideoStoragePath
      ? [{ type: "video" as const, assetId: requestedVideoStoragePath }]
      : []),
    ...parsed.media,
  ]);
  const videoStoragePath =
    requestedVideoStoragePath ??
    media.find((item) => item.type === "video" && item.assetId)?.assetId ??
    null;
  const productGallery = mergeProductGalleryItems([
    ...imageGallery,
    ...media
      .filter((item) => item.type === "image")
      .map((item) => ({
        type: "image" as const,
        assetId: item.assetId,
        imageAssetId: item.assetId,
        imageDataUrl: item.url ?? null,
        alt: item.alt,
      })),
  ]);

  const payload: MenuProductPayload = {
    cafe_id: cafe.id,
    category_id: parsed.categoryId ?? null,
    legacy_category: parsed.category ?? null,
    name: parsed.name,
    description: parsed.description,
    price: parsed.price,
    calories: parsed.calories ?? null,
    loyalty_points: 0,
    preparation_time_minutes: parsed.preparationTimeMinutes ?? null,
    redeemable_with_points: false,
    redemption_points: null,
    available_for_pickup: parsed.availableForPickup,
    pickup_lead_minutes: parsed.pickupLeadTimeMinutes ?? null,
    ingredients: parsed.ingredients,
    available: parsed.available,
    image_variant: parsed.imageVariant,
    image_storage_path: parsed.imageStoragePath ?? null,
    image_url: persistableUrl(parsed.imageUrl),
    image_gallery: productGallery,
    gallery_storage_paths: galleryStoragePaths(productGallery),
    video_storage_path: videoStoragePath,
    media,
    promo: parsed.promo ?? null,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("menu_products")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (data) {
      if (cafe.businessCategory === "events_conferences") {
        await upsertEventTicketSettings(supabase, cafe.id, String(data.id), parsed.eventTicketSettings);
      }
      invalidatePublicMenuSurfaces(cafe.slug);
      return data as DbMenuProduct;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("menu_products")
      .insert({ ...payload, id: parsed.id })
      .select("*")
      .single();

    if (insertError) throw insertError;
    if (cafe.businessCategory === "events_conferences") {
      await upsertEventTicketSettings(supabase, cafe.id, String(inserted.id), parsed.eventTicketSettings);
    }
    invalidatePublicMenuSurfaces(cafe.slug);
    return inserted as DbMenuProduct;
  }

  const { data, error } = await supabase
    .from("menu_products")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  if (cafe.businessCategory === "events_conferences") {
    await upsertEventTicketSettings(supabase, cafe.id, String(data.id), parsed.eventTicketSettings);
  }
  invalidatePublicMenuSurfaces(cafe.slug);
  return data as DbMenuProduct;
}

export async function softDeleteMenuProduct(productId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_products")
    .update({ deleted_at: new Date().toISOString(), available: false })
    .eq("id", productId)
    .eq("cafe_id", cafe.id);
  if (error) throw error;
  invalidatePublicMenuSurfaces(cafe.slug);
}

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int(),
  visible: z.boolean(),
  featured: z.boolean(),
  icon: z.string().optional(),
  imageStoragePath: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
});

type MenuCategoryPayload = {
  cafe_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  visible: boolean;
  featured: boolean;
  icon: string | null;
  image_storage_path: string | null;
  image_url: string | null;
};

export async function upsertMenuCategory(input: z.infer<typeof categorySchema>) {
  const parsed = categorySchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload: MenuCategoryPayload = {
    cafe_id: cafe.id,
    name: parsed.name,
    description: parsed.description ?? null,
    sort_order: parsed.sortOrder,
    visible: parsed.visible,
    featured: parsed.featured,
    icon: parsed.icon ?? null,
    image_storage_path: parsed.imageStoragePath ?? null,
    image_url: parsed.imageUrl ?? null,
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from("menu_categories")
      .update(payload)
      .eq("id", parsed.id)
      .eq("cafe_id", cafe.id)
      .select("*")
      .single();
    if (error) throw error;
    const record = mapDbCategoryToRecord(cafe.slug, data as DbMenuCategory);
    invalidatePublicMenuSurfaces(cafe.slug);
    return record;
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  const record = mapDbCategoryToRecord(cafe.slug, data as DbMenuCategory);
  invalidatePublicMenuSurfaces(cafe.slug);
  return record;
}

export type DeleteMenuCategoryResult =
  | { ok: true }
  | { ok: false; reason: "has_products"; linkedProducts: number }
  | { ok: false; reason: "not_found" };

export async function softDeleteMenuCategory(
  categoryId: string
): Promise<DeleteMenuCategoryResult> {
  const parsedCategoryId = z.string().uuid().parse(categoryId);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { count, error: productsError } = await supabase
    .from("menu_products")
    .select("id", { count: "exact", head: true })
    .eq("cafe_id", cafe.id)
    .eq("category_id", parsedCategoryId)
    .is("deleted_at", null);

  if (productsError) throw productsError;
  if ((count ?? 0) > 0) {
    return { ok: false, reason: "has_products", linkedProducts: count ?? 0 };
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .update({ deleted_at: new Date().toISOString(), visible: false })
    .eq("id", parsedCategoryId)
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  invalidatePublicMenuSurfaces(cafe.slug);
  return { ok: true };
}

export async function saveAllMenuCategories(categories: MenuCategoryRecord[]) {
  const results: MenuCategoryRecord[] = [];
  for (const cat of categories) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(cat.id);
    const saved = await upsertMenuCategory({
      id: isUuid ? cat.id : undefined,
      name: cat.name,
      description: cat.description,
      sortOrder: cat.sortOrder,
      visible: cat.visible,
      featured: cat.featured,
      icon: cat.icon,
      imageStoragePath: cat.imageAssetId ?? null,
      imageUrl: null,
    });
    results.push(saved);
  }
  return results;
}
