import { createAdminClient } from "@/lib/supabase/admin";

const AVATAR_MIME = ["image/webp", "image/jpeg", "image/png", "image/avif"] as const;
const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;

export type CustomerAvatarUploadContext = {
  cafeId: string;
  customerId: string;
  previousStoragePath?: string | null;
};

function assertSafePathSegment(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

function normalizeMime(type: string) {
  return type.toLowerCase().split(";")[0]?.trim() ?? "";
}

function extensionForMime(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      return null;
  }
}

export function validateCustomerAvatarFile(file: File) {
  if (file.size > MAX_ORIGINAL_BYTES) {
    return {
      ok: false as const,
      code: "file_too_large",
      error: "Image file is too large (max 5 MB)",
    };
  }

  const mime = normalizeMime(file.type);
  if (!AVATAR_MIME.includes(mime as (typeof AVATAR_MIME)[number])) {
    return {
      ok: false as const,
      code: "unsupported_type",
      error: "Unsupported image type",
    };
  }

  return { ok: true as const, mime };
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

export async function validateCustomerAvatarContent(file: File, mime: string) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());

  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mime === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }

  if (mime === "image/webp") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }

  if (mime === "image/avif") {
    const brand = ascii(bytes, 8, 12);
    return ascii(bytes, 4, 8) === "ftyp" && (brand === "avif" || brand === "avis");
  }

  return false;
}

/** Upload customer avatar under `{cafeId}/{customerId}/avatar-{timestamp}.{ext}`. */
export async function uploadCustomerAvatar(file: File, context: CustomerAvatarUploadContext) {
  const validation = validateCustomerAvatarFile(file);
  if (!validation.ok) throw new Error(validation.error);
  if (!(await validateCustomerAvatarContent(file, validation.mime))) {
    throw new Error("Unsupported image type");
  }

  assertSafePathSegment(context.cafeId);
  assertSafePathSegment(context.customerId);

  const ext = extensionForMime(validation.mime);
  if (!ext) throw new Error("Unsupported image type");

  const fileName = `avatar-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  assertSafePathSegment(fileName);
  const storagePath = `${context.cafeId}/${context.customerId}/${fileName}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from("customer-avatars").upload(storagePath, file, {
    contentType: validation.mime,
    upsert: false,
  });
  if (error) throw error;

  return {
    storagePath,
    byteSize: file.size,
    previousStoragePath: context.previousStoragePath ?? null,
  };
}

export async function deleteCustomerAvatar(storagePath: string) {
  const admin = createAdminClient();
  const { error } = await admin.storage.from("customer-avatars").remove([storagePath]);
  if (error) throw error;
}
