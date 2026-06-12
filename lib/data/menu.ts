import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext, getPublicCafeBySlugAdmin } from "@/lib/data/cafes";
import {
  mapDbCategoryToRecord,
  mapDbProductToMenuProduct,
  type DbMenuCategory,
  type DbMenuProduct,
} from "@/lib/data/mappers";
import type { MenuCategoryRecord } from "@/lib/mock/menu-categories";
import type { MenuProduct } from "@/lib/mock/menu";

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

  return {
    categories: categoryRows.map((c) => mapDbCategoryToRecord(slug, c)),
    products: ((products ?? []) as DbMenuProduct[]).map((p) =>
      mapDbProductToMenuProduct(p, p.category_id ? categoryMap.get(p.category_id) : undefined)
    ),
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

  return {
    cafe,
    categories: categoryRows.map((c) => mapDbCategoryToRecord(cafe.slug, c)),
    products: ((products ?? []) as DbMenuProduct[]).map((p) =>
      mapDbProductToMenuProduct(p, p.category_id ? categoryMap.get(p.category_id) : undefined)
    ),
  };
}

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
  imageGallery: z.array(z.object({ imageAssetId: z.string().optional(), imageDataUrl: z.string().optional().nullable(), alt: z.string().optional() })).optional().default([]),
  promo: z.unknown().optional().nullable(),
});

export async function upsertMenuProduct(input: z.infer<typeof productSchema>) {
  const parsed = productSchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
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
    image_url: parsed.imageUrl ?? null,
    image_gallery: parsed.imageGallery ?? [],
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
    if (data) return data as DbMenuProduct;

    const { data: inserted, error: insertError } = await supabase
      .from("menu_products")
      .insert({ ...payload, id: parsed.id })
      .select("*")
      .single();

    if (insertError) throw insertError;
    return inserted as DbMenuProduct;
  }

  const { data, error } = await supabase
    .from("menu_products")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
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
  imageGallery: z.array(z.object({ imageAssetId: z.string().optional(), imageDataUrl: z.string().optional().nullable(), alt: z.string().optional() })).optional().default([]),
});

export async function upsertMenuCategory(input: z.infer<typeof categorySchema>) {
  const parsed = categorySchema.parse(input);
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const payload = {
    cafe_id: cafe.id,
    name: parsed.name,
    description: parsed.description ?? null,
    sort_order: parsed.sortOrder,
    visible: parsed.visible,
    featured: parsed.featured,
    icon: parsed.icon ?? null,
    image_storage_path: parsed.imageStoragePath ?? null,
    image_url: parsed.imageUrl ?? null,
    image_gallery: parsed.imageGallery ?? [],
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
    return mapDbCategoryToRecord(cafe.slug, data as DbMenuCategory);
  }

  const { data, error } = await supabase
    .from("menu_categories")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapDbCategoryToRecord(cafe.slug, data as DbMenuCategory);
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
      imageGallery: [],
    });
    results.push(saved);
  }
  return results;
}
