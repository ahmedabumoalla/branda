import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import type { ImageAssetPurpose } from "@/lib/cafe/image-asset-pipeline";

export type StorageBucket =
  | "cafe-logos"
  | "cafe-backgrounds"
  | "menu-products"
  | "menu-categories"
  | "offer-banners"
  | "customer-avatars"
  | "marketing-assets"
  | "experience-submissions";

const MAX_SERVER_UPLOAD_BYTES = 40 * 1024 * 1024;

const BUCKET_MIME: Record<StorageBucket, string[]> = {
  "cafe-logos": ["image/webp", "image/jpeg", "image/png", "image/avif"],
  "cafe-backgrounds": ["image/webp", "image/jpeg", "image/png", "image/avif"],
  "menu-products": ["image/webp", "image/jpeg", "image/png", "image/avif", "video/mp4", "video/webm", "video/quicktime"],
  "menu-categories": ["image/webp", "image/jpeg", "image/png", "image/avif"],
  "offer-banners": ["image/webp", "image/jpeg", "image/png", "image/avif"],
  "customer-avatars": ["image/webp", "image/jpeg", "image/png", "image/avif"],
  "marketing-assets": ["image/webp", "image/jpeg", "image/png", "image/avif"],
  "experience-submissions": ["image/webp", "image/jpeg", "image/png", "image/avif"],
};

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

function getServiceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PRIVATE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  );
}

function createStorageAdminClient() {
  const url = getSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase service role configuration for server storage upload");
  }

  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeMime(type: string) {
  return type.toLowerCase().split(";")[0].trim();
}

function extensionFromMime(mimeType: string) {
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/avif") return "avif";
  return "jpg";
}

function assertSafePathSegment(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("\\") || segment.includes(":")) {
    throw new Error("Invalid storage path segment");
  }
}

function normalizeEntityPath(entityId: string) {
  const parts = entityId
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error("Invalid storage path segment");
  }

  for (const part of parts) {
    assertSafePathSegment(part);
  }

  return parts.join("/");
}

function buildStoragePath(
  bucket: StorageBucket,
  cafeId: string,
  entityId: string,
  fileName: string
) {
  assertSafePathSegment(fileName);

  switch (bucket) {
    case "cafe-logos":
    case "cafe-backgrounds":
      return `${cafeId}/${normalizeEntityPath(entityId)}/${fileName}`;

    case "menu-products":
    case "menu-categories":
    case "offer-banners":
    case "marketing-assets":
      return `${cafeId}/${normalizeEntityPath(entityId)}/${fileName}`;

    default:
      throw new Error(`Bucket ${bucket} requires dedicated upload handler`);
  }
}

export async function uploadOptimizedImage(
  bucket: StorageBucket,
  file: File,
  _purpose: ImageAssetPurpose,
  entityId: string
) {
  const cafe = await requireOwnerCafeContext();

  if (file.size <= 0) {
    throw new Error("Missing file");
  }

  if (file.size > MAX_SERVER_UPLOAD_BYTES) {
    throw new Error("حجم الصورة كبير جدًا، اختر ملفًا أقل من 40MB");
  }

  const mimeType = normalizeMime(file.type || "application/octet-stream");

  if (mimeType === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
    throw new Error("ارفع الصورة بصيغة PNG أو JPG أو WEBP");
  }

  if (!BUCKET_MIME[bucket].includes(mimeType)) {
    throw new Error("صيغة الصورة غير مدعومة، جرّب PNG أو JPG أو WEBP");
  }

  const ext = extensionFromMime(mimeType);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = buildStoragePath(bucket, cafe.id, entityId, fileName);
  const arrayBuffer = await file.arrayBuffer();

  const supabaseAdmin = createStorageAdminClient();
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, arrayBuffer, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) throw error;

  return {
    storagePath,
    byteSize: file.size,
  };
}

export async function uploadGeneratedImageBytes(
  bucket: Extract<StorageBucket, "offer-banners" | "marketing-assets">,
  bytes: Uint8Array | ArrayBuffer,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  entityId: string
) {
  const cafe = await requireOwnerCafeContext();
  const byteLength = bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength;

  if (byteLength <= 0) throw new Error("Missing generated image");
  if (byteLength > MAX_SERVER_UPLOAD_BYTES) {
    throw new Error("حجم بطاقة العرض كبير جدًا");
  }

  if (!BUCKET_MIME[bucket].includes(mimeType)) {
    throw new Error("صيغة البطاقة غير مدعومة");
  }

  const ext = extensionFromMime(mimeType);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = buildStoragePath(bucket, cafe.id, entityId, fileName);
  const supabaseAdmin = createStorageAdminClient();
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) throw error;
  return { storagePath, byteSize: byteLength };
}

export async function deleteStorageObject(bucket: StorageBucket, storagePath: string) {
  const cafe = await requireOwnerCafeContext();
  const pathCafeId = storagePath.split("/")[0];

  if (pathCafeId !== cafe.id) {
    throw new Error("Forbidden: storage path does not belong to this cafe");
  }

  const supabaseAdmin = createStorageAdminClient();
  const { error } = await supabaseAdmin.storage.from(bucket).remove([storagePath]);
  if (error) throw error;
}

function videoExtensionFromMime(mimeType: string) {
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

function videoMimeFromFile(file: File) {
  const mimeType = normalizeMime(file.type || "");
  if (["video/mp4", "video/webm", "video/quicktime"].includes(mimeType)) {
    return mimeType;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".mp4")) return "video/mp4";
  return mimeType || "application/octet-stream";
}

export async function uploadProductVideo(file: File, entityId: string) {
  const cafe = await requireOwnerCafeContext();

  if (file.size <= 0) throw new Error("Missing file");
  if (file.size > MAX_SERVER_UPLOAD_BYTES) throw new Error("ط­ط¬ظ… ط§ظ„ظپظٹط¯ظٹظˆ ظƒط¨ظٹط± ط¬ط¯ظ‹ط§طŒ ط§ط®طھط± ظ…ظ„ظپظ‹ط§ ط£ظ‚ظ„ ظ…ظ† 40MB");

  const mimeType = videoMimeFromFile(file);
  if (!["video/mp4", "video/webm", "video/quicktime"].includes(mimeType)) {
    throw new Error("طµظٹط؛ط© ط§ظ„ظپظٹط¯ظٹظˆ ط؛ظٹط± ظ…ط¯ط¹ظˆظ…ط©طŒ ط§ط±ظپط¹ MP4 ط£ظˆ WEBM ط£ظˆ MOV");
  }

  const ext = videoExtensionFromMime(mimeType);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = buildStoragePath("menu-products", cafe.id, entityId, fileName);
  const arrayBuffer = await file.arrayBuffer();
  const supabaseAdmin = createStorageAdminClient();
  const { error } = await supabaseAdmin.storage.from("menu-products").upload(storagePath, arrayBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return { storagePath, byteSize: file.size, mimeType };
}

export async function uploadReservationServiceVideo(file: File, entityId: string) {
  const cafe = await requireOwnerCafeContext();

  if (file.size <= 0) throw new Error("Missing file");
  if (file.size > MAX_SERVER_UPLOAD_BYTES) throw new Error("حجم الفيديو كبير جدًا، اختر ملفًا أقل من 40MB");

  const mimeType = videoMimeFromFile(file);
  if (!["video/mp4", "video/webm", "video/quicktime"].includes(mimeType)) {
    throw new Error("صيغة الفيديو غير مدعومة، ارفع MP4 أو WEBM أو MOV");
  }

  const ext = videoExtensionFromMime(mimeType);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${cafe.id}/${normalizeEntityPath(entityId)}/${fileName}`;
  const arrayBuffer = await file.arrayBuffer();
  const supabaseAdmin = createStorageAdminClient();
  const { error } = await supabaseAdmin.storage.from("marketing-assets").upload(storagePath, arrayBuffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return { storagePath, byteSize: file.size };
}
