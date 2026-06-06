import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";

export type StorageBucket =
  | "cafe-logos"
  | "cafe-backgrounds"
  | "menu-products"
  | "menu-categories"
  | "offer-banners"
  | "customer-avatars"
  | "marketing-assets"
  | "experience-submissions";

const BUCKET_MIME: Record<StorageBucket, string[]> = {
  "cafe-logos": ["image/webp", "image/jpeg", "image/png"],
  "cafe-backgrounds": ["image/webp", "image/jpeg", "image/png"],
  "menu-products": ["image/webp", "image/jpeg", "image/png"],
  "menu-categories": ["image/webp", "image/jpeg", "image/png"],
  "offer-banners": ["image/webp", "image/jpeg", "image/png"],
  "customer-avatars": ["image/webp", "image/jpeg", "image/png"],
  "marketing-assets": ["image/webp", "image/jpeg", "image/png"],
  "experience-submissions": ["image/webp", "image/jpeg", "image/png"],
};

function assertSafeFileName(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

function buildStoragePath(
  bucket: StorageBucket,
  cafeId: string,
  entityId: string,
  fileName: string
) {
  assertSafeFileName(entityId);
  assertSafeFileName(fileName);

  switch (bucket) {
    case "cafe-logos":
    case "cafe-backgrounds":
      return `${cafeId}/${fileName}`;
    case "menu-products":
    case "menu-categories":
    case "offer-banners":
    case "marketing-assets":
      return `${cafeId}/${entityId}/${fileName}`;
    default:
      throw new Error(`Bucket ${bucket} requires dedicated upload handler`);
  }
}

export async function uploadOptimizedImage(
  bucket: StorageBucket,
  file: File,
  purpose: Parameters<typeof optimizeImageForStorage>[1],
  entityId: string
) {
  const cafe = await requireOwnerCafeContext();
  const optimized = await optimizeImageForStorage(file, purpose);

  if (!BUCKET_MIME[bucket].includes(optimized.mimeType)) {
    throw new Error("Unsupported file type after optimization");
  }

  const ext = optimized.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = buildStoragePath(bucket, cafe.id, entityId, fileName);

  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).upload(storagePath, optimized.blob, {
    contentType: optimized.mimeType,
    upsert: false,
  });
  if (error) throw error;

  return {
    storagePath,
    byteSize: optimized.sizeBytes,
  };
}

export async function deleteStorageObject(bucket: StorageBucket, storagePath: string) {
  const cafe = await requireOwnerCafeContext();
  const pathCafeId = storagePath.split("/")[0];
  if (pathCafeId !== cafe.id) {
    throw new Error("Forbidden: storage path does not belong to this cafe");
  }

  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) throw error;
}
