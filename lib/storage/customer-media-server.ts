import { createClient } from "@/lib/supabase/server";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";

const AVATAR_MIME = ["image/webp", "image/jpeg", "image/png"];
/** Max raw upload before server-side optimization (5 MB). */
const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024;
/** Matches customer-avatars bucket limit in migration 002 (2 MB). */
const MAX_FINAL_BYTES = 2 * 1024 * 1024;

function assertSafePathSegment(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

/** Upload customer avatar — stores `{userId}/{uuid}.webp` in customer-avatars only. */
export async function uploadCustomerAvatar(cafeSlug: string, file: File) {
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("Image file is too large (max 5 MB before processing)");
  }

  const { user, profile } = await requireCustomerProfileForSession(cafeSlug);
  const optimized = await optimizeImageForStorage(file, "customer-avatar");

  if (!AVATAR_MIME.includes(optimized.mimeType)) {
    throw new Error("Unsupported file type after optimization");
  }

  if (optimized.sizeBytes > MAX_FINAL_BYTES) {
    throw new Error("Optimized image exceeds safe size limit (max 2 MB)");
  }

  const ext = optimized.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  assertSafePathSegment(fileName);
  const storagePath = `${user.id}/${fileName}`;
  const previousStoragePath = (profile.avatar_storage_path as string | null | undefined) ?? null;

  const supabase = await createClient();
  const { error } = await supabase.storage.from("customer-avatars").upload(storagePath, optimized.blob, {
    contentType: optimized.mimeType,
    upsert: false,
  });
  if (error) throw error;

  return {
    storagePath,
    byteSize: optimized.sizeBytes,
    previousStoragePath,
  };
}

export async function deleteCustomerAvatar(storagePath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const ownerId = storagePath.split("/")[0];
  if (ownerId !== user.id) {
    throw new Error("Forbidden: avatar path does not belong to current user");
  }

  const { error } = await supabase.storage.from("customer-avatars").remove([storagePath]);
  if (error) throw error;
}
