import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { analyzeMenuPdf } from "@/lib/menu-import/pdf-extractor";
import { analyzeMenuUrl } from "@/lib/menu-import/url-extractor";
import type {
  ExtractedMenuItem,
  MenuImportAnalysis,
  MenuImportEditableItem,
  MenuImportItemStatus,
  MenuImportReviewItem,
  MenuImportReviewJob,
  MenuImportSourceType,
} from "@/lib/menu-import/types";
import { clearServerMemoryCache } from "@/lib/performance/server-memory-cache";

type DbImportJob = {
  id: string;
  source_type: MenuImportSourceType;
  source_url: string | null;
  source_file_path: string | null;
  status: MenuImportReviewJob["status"];
  error_message: string | null;
  raw_summary: Record<string, unknown> | null;
  created_at: string;
};

type DbImportItem = {
  id: string;
  category_name: string | null;
  product_name: string;
  description: string | null;
  price: number | string | null;
  calories: number | null;
  prep_time_minutes: number | null;
  chef_name: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  gallery_urls: unknown;
  gallery_storage_paths: unknown;
  metadata: Record<string, unknown> | null;
  status: MenuImportItemStatus;
};

const editableItemSchema = z.object({
  id: z.string().uuid(),
  categoryName: z.string().optional().default(""),
  productName: z.string().optional().default(""),
  description: z.string().optional().default(""),
  price: z.number().min(0).nullable().optional(),
  calories: z.number().int().min(0).nullable().optional(),
  prepTimeMinutes: z.number().int().min(0).nullable().optional(),
  chefName: z.string().optional().default(""),
  imageUrl: z.string().optional().default(""),
  imageStoragePath: z.string().optional().default(""),
  status: z.enum(["ready", "needs_review", "skipped"]),
});

const editableItemsSchema = z.array(editableItemSchema);
const defaultCategoryName = "غير مصنف";

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function normalizeText(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizeCategoryName(value?: string | null) {
  return normalizeText(value) || defaultCategoryName;
}

function mapItem(row: DbImportItem): MenuImportReviewItem {
  return {
    id: row.id,
    categoryName: row.category_name ?? "",
    productName: row.product_name ?? "",
    description: row.description ?? "",
    price: row.price == null ? null : Number(row.price),
    calories: row.calories ?? null,
    prepTimeMinutes: row.prep_time_minutes ?? null,
    chefName: row.chef_name ?? "",
    imageUrl: row.image_url ?? "",
    imageStoragePath: row.image_storage_path ?? "",
    galleryUrls: toStringArray(row.gallery_urls),
    galleryStoragePaths: toStringArray(row.gallery_storage_paths),
    metadata: row.metadata ?? {},
    status: row.status,
  };
}

function mapJob(job: DbImportJob, items: DbImportItem[]): MenuImportReviewJob {
  return {
    id: job.id,
    sourceType: job.source_type,
    sourceUrl: job.source_url,
    sourceFilePath: job.source_file_path,
    status: job.status,
    errorMessage: job.error_message,
    rawSummary: job.raw_summary,
    createdAt: job.created_at,
    items: items.map(mapItem),
  };
}

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function createImportJob(sourceType: MenuImportSourceType, sourceUrl?: string | null) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const createdBy = await currentUserId();
  const { data, error } = await supabase
    .from("menu_import_jobs")
    .insert({
      cafe_id: cafe.id,
      created_by: createdBy,
      source_type: sourceType,
      source_url: sourceUrl ?? null,
      status: "processing",
    })
    .select("id, source_type, source_url, source_file_path, status, error_message, raw_summary, created_at")
    .single();

  if (error) throw error;
  return { cafe, job: data as DbImportJob };
}

function extensionFromMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("avif")) return "avif";
  return "jpg";
}

async function fetchImageBytes(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5" },
    });
    if (!response.ok) throw new Error(`image ${response.status}`);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase().split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) {
      throw new Error("unsupported image type");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("image too large");
    return { bytes, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadExternalImage(cafeId: string, productId: string, imageUrl: string) {
  const { bytes, contentType } = await fetchImageBytes(imageUrl);
  const fileName = `${crypto.randomUUID()}.${extensionFromMime(contentType)}`;
  const storagePath = `${cafeId}/${productId}/${fileName}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("menu-products").upload(storagePath, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return storagePath;
}

async function enrichImages(cafeId: string, analysis: MenuImportAnalysis) {
  const imageDownloadFailures: string[] = [];
  const items: ExtractedMenuItem[] = [];

  for (const item of analysis.items) {
    const targetProductId = crypto.randomUUID();
    const metadata = { ...(item.metadata ?? {}), targetProductId };
    let imageStoragePath = item.imageStoragePath ?? null;

    if (!imageStoragePath && item.imageUrl) {
      try {
        imageStoragePath = await uploadExternalImage(cafeId, targetProductId, item.imageUrl);
      } catch {
        imageDownloadFailures.push(item.imageUrl);
      }
    }

    items.push({
      ...item,
      imageStoragePath,
      metadata,
    });
  }

  return {
    ...analysis,
    items,
    report: {
      ...analysis.report,
      imageDownloadFailures,
    },
    rawSummary: {
      ...analysis.rawSummary,
      report: {
        ...analysis.report,
        imageDownloadFailures,
      },
    },
  };
}

function skipPreviewImageProcessing(analysis: MenuImportAnalysis) {
  return {
    ...analysis,
    rawSummary: {
      ...analysis.rawSummary,
      previewImageProcessing: "skipped-for-url-preview",
      report: analysis.report,
    },
  };
}

async function insertAnalysisItems(cafeId: string, jobId: string, analysis: MenuImportAnalysis) {
  const supabase = await createClient();
  const rows = analysis.items.map((item) => ({
    job_id: jobId,
    cafe_id: cafeId,
    category_name: normalizeCategoryName(item.categoryName),
    product_name: normalizeText(item.productName),
    description: normalizeText(item.description) || null,
    price: item.price ?? null,
    calories: item.calories ?? null,
    prep_time_minutes: item.prepTimeMinutes ?? null,
    chef_name: normalizeText(item.chefName) || null,
    image_url: normalizeText(item.imageUrl) || null,
    image_storage_path: normalizeText(item.imageStoragePath) || null,
    gallery_urls: item.galleryUrls ?? [],
    gallery_storage_paths: item.galleryStoragePaths ?? [],
    metadata: item.metadata ?? {},
    status: item.status,
  }));

  if (rows.length) {
    const { error } = await supabase.from("menu_import_items").insert(rows);
    if (error) throw error;
  }

  const status = rows.length ? "ready" : "ready";
  const emptyResultMessage =
    analysis.report.notes[0] ||
    "لم يتم استخراج منتجات واضحة. يمكن إدخال الصفوف يدويًا أو تجربة مصدر آخر.";
  const { error: updateError } = await supabase
    .from("menu_import_jobs")
    .update({
      status,
      raw_summary: {
        ...analysis.rawSummary,
        report: analysis.report,
      },
      error_message: rows.length ? null : emptyResultMessage,
    })
    .eq("id", jobId)
    .eq("cafe_id", cafeId);

  if (updateError) throw updateError;
}

export async function getMenuImportJob(jobId: string): Promise<MenuImportReviewJob> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const [{ data: job, error: jobError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("menu_import_jobs")
      .select("id, source_type, source_url, source_file_path, status, error_message, raw_summary, created_at")
      .eq("id", jobId)
      .eq("cafe_id", cafe.id)
      .single(),
    supabase
      .from("menu_import_items")
      .select("*")
      .eq("job_id", jobId)
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: true }),
  ]);

  if (jobError) throw jobError;
  if (itemsError) throw itemsError;
  return mapJob(job as DbImportJob, (items ?? []) as DbImportItem[]);
}

export async function createMenuImportFromUrl(sourceUrl: string) {
  const trimmedUrl = normalizeText(sourceUrl);
  if (!trimmedUrl) throw new Error("أدخل رابط المنيو");

  const { cafe, job } = await createImportJob("url", trimmedUrl);
  try {
    const analysis = await analyzeMenuUrl(trimmedUrl);
    const previewAnalysis = skipPreviewImageProcessing(analysis);
    await insertAnalysisItems(cafe.id, job.id, previewAnalysis);
    return getMenuImportJob(job.id);
  } catch (error) {
    const supabase = await createClient();
    await supabase
      .from("menu_import_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "تعذر تحليل الرابط",
      })
      .eq("id", job.id)
      .eq("cafe_id", cafe.id);
    return getMenuImportJob(job.id);
  }
}

export async function createMenuImportFromPdf(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("اختر ملف PDF");

  const { cafe, job } = await createImportJob("pdf", null);
  try {
    const { analysis, bytes } = await analyzeMenuPdf(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "menu.pdf";
    const sourceFilePath = `${cafe.id}/${job.id}/${safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`}`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from("menu-imports").upload(sourceFilePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    await insertAnalysisItems(cafe.id, job.id, analysis);
    const supabase = await createClient();
    await supabase
      .from("menu_import_jobs")
      .update({ source_file_path: sourceFilePath })
      .eq("id", job.id)
      .eq("cafe_id", cafe.id);
    return getMenuImportJob(job.id);
  } catch (error) {
    const supabase = await createClient();
    await supabase
      .from("menu_import_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "تعذر تحليل ملف PDF",
      })
      .eq("id", job.id)
      .eq("cafe_id", cafe.id);
    return getMenuImportJob(job.id);
  }
}

export async function updateMenuImportItems(jobId: string, input: MenuImportEditableItem[]) {
  const cafe = await requireOwnerCafeContext();
  const parsed = editableItemsSchema.parse(input);
  const supabase = await createClient();

  for (const item of parsed) {
    const productName = normalizeText(item.productName);
    const nextStatus = productName ? item.status : "needs_review";
    const { error } = await supabase
      .from("menu_import_items")
      .update({
        category_name: normalizeCategoryName(item.categoryName),
        product_name: productName,
        description: normalizeText(item.description) || null,
        price: item.price ?? null,
        calories: item.calories ?? null,
        prep_time_minutes: item.prepTimeMinutes ?? null,
        chef_name: normalizeText(item.chefName) || null,
        image_url: normalizeText(item.imageUrl) || null,
        image_storage_path: normalizeText(item.imageStoragePath) || null,
        status: nextStatus,
      })
      .eq("id", item.id)
      .eq("job_id", jobId)
      .eq("cafe_id", cafe.id);
    if (error) throw error;
  }

  return getMenuImportJob(jobId);
}

async function ensureCategory(categoryMap: Map<string, string>, cafeId: string, name: string, sortOrder: number) {
  const normalized = normalizeCategoryName(name);
  const key = normalized.toLowerCase();
  const existing = categoryMap.get(key);
  if (existing) return existing;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_categories")
    .insert({
      cafe_id: cafeId,
      name: normalized,
      description: null,
      sort_order: sortOrder,
      visible: true,
      featured: false,
    })
    .select("id, name")
    .single();

  if (error) throw error;
  categoryMap.set(key, String(data.id));
  return String(data.id);
}

function invalidateMenu(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  clearServerMemoryCache(`public-menu:${normalizedSlug}`);
  clearServerMemoryCache(`public-cafe-fast:${normalizedSlug}`);
  revalidatePath(`/dashboard/menu`);
  revalidatePath(`/c/${normalizedSlug}`);
  revalidatePath(`/c/${normalizedSlug}/products/latest`);
  revalidatePath(`/c/${normalizedSlug}/products/popular`);
  revalidatePath(`/c/${normalizedSlug}/products/offers`);
}

export async function approveMenuImport(jobId: string, input: MenuImportEditableItem[]) {
  const cafe = await requireOwnerCafeContext();
  await updateMenuImportItems(jobId, input);
  const supabase = await createClient();

  const [{ data: categories, error: categoryError }, { data: products, error: productsError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("menu_categories")
      .select("id, name, sort_order")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("menu_products")
      .select("id, name, category_id")
      .eq("cafe_id", cafe.id)
      .is("deleted_at", null),
    supabase
      .from("menu_import_items")
      .select("*")
      .eq("job_id", jobId)
      .eq("cafe_id", cafe.id)
      .order("created_at", { ascending: true }),
  ]);

  if (categoryError) throw categoryError;
  if (productsError) throw productsError;
  if (itemsError) throw itemsError;

  const categoryMap = new Map<string, string>();
  let nextSortOrder = 1;
  for (const category of (categories ?? []) as Array<{ id: string; name: string; sort_order: number }>) {
    categoryMap.set(category.name.trim().toLowerCase(), category.id);
    nextSortOrder = Math.max(nextSortOrder, Number(category.sort_order ?? 0) + 1);
  }

  const duplicateKeys = new Set(
    ((products ?? []) as Array<{ name: string; category_id: string | null }>).map((product) =>
      `${normalizeText(product.name).toLowerCase()}:${product.category_id ?? ""}`
    )
  );

  let importedCount = 0;
  let skippedCount = 0;

  for (const item of (items ?? []) as DbImportItem[]) {
    if (item.status !== "ready" || !normalizeText(item.product_name)) {
      skippedCount += 1;
      continue;
    }

    const categoryId = await ensureCategory(categoryMap, cafe.id, normalizeCategoryName(item.category_name), nextSortOrder);
    nextSortOrder += 1;
    const duplicateKey = `${normalizeText(item.product_name).toLowerCase()}:${categoryId}`;
    if (duplicateKeys.has(duplicateKey)) {
      skippedCount += 1;
      await supabase.from("menu_import_items").update({ status: "needs_review" }).eq("id", item.id).eq("cafe_id", cafe.id);
      continue;
    }

    const metadata = item.metadata ?? {};
    const targetProductId =
      typeof metadata.targetProductId === "string" && /^[0-9a-f-]{36}$/i.test(metadata.targetProductId)
        ? metadata.targetProductId
        : crypto.randomUUID();
    const galleryStoragePaths = toStringArray(item.gallery_storage_paths);
    const galleryUrls = toStringArray(item.gallery_urls);
    const imageGallery = [
      ...(item.image_storage_path ? [{ type: "image", assetId: item.image_storage_path, imageAssetId: item.image_storage_path, imageDataUrl: null }] : []),
      ...galleryStoragePaths.map((path) => ({ type: "image", assetId: path, imageAssetId: path, imageDataUrl: null })),
      ...galleryUrls.map((url) => ({ type: "image", imageDataUrl: url })),
    ];

    const { error: insertError } = await supabase.from("menu_products").insert({
      id: targetProductId,
      cafe_id: cafe.id,
      category_id: categoryId,
      legacy_category: normalizeCategoryName(item.category_name),
      name: normalizeText(item.product_name),
      description: normalizeText(item.description),
      price: item.price == null ? 0 : Number(item.price),
      calories: item.calories,
      preparation_time_minutes: item.prep_time_minutes,
      ingredients: [],
      image_variant: "latte",
      image_storage_path: item.image_storage_path,
      image_url: item.image_storage_path ? null : item.image_url,
      image_gallery: imageGallery,
      gallery_storage_paths: galleryStoragePaths,
      available: true,
      available_for_pickup: true,
      loyalty_points: 0,
      redeemable_with_points: false,
      redemption_points: null,
      pickup_lead_minutes: null,
      promo: null,
    });

    if (insertError) {
      skippedCount += 1;
      await supabase
        .from("menu_import_items")
        .update({
          status: "needs_review",
          metadata: { ...metadata, importError: insertError.message },
        })
        .eq("id", item.id)
        .eq("cafe_id", cafe.id);
      continue;
    }

    duplicateKeys.add(duplicateKey);
    importedCount += 1;
    await supabase.from("menu_import_items").update({ status: "imported" }).eq("id", item.id).eq("cafe_id", cafe.id);
  }

  const { error: jobUpdateError } = await supabase
    .from("menu_import_jobs")
    .update({
      status: importedCount > 0 ? "imported" : "ready",
      raw_summary: {
        importedCount,
        skippedCount,
        approvedAt: new Date().toISOString(),
      },
    })
    .eq("id", jobId)
    .eq("cafe_id", cafe.id);

  if (jobUpdateError) throw jobUpdateError;
  invalidateMenu(cafe.slug);
  return getMenuImportJob(jobId);
}

export async function cancelMenuImport(jobId: string) {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_import_jobs")
    .update({ status: "failed", error_message: "تم إلغاء الاستيراد قبل الاعتماد." })
    .eq("id", jobId)
    .eq("cafe_id", cafe.id)
    .neq("status", "imported");
  if (error) throw error;
  return getMenuImportJob(jobId);
}
