import type { SupabaseClient } from "@supabase/supabase-js";

/** Buckets allowed on the anonymous public signed-URL endpoint only. */
export const ANON_PUBLIC_STORAGE_BUCKETS = [
  "cafe-logos",
  "cafe-backgrounds",
  "menu-products",
  "menu-categories",
  "offer-banners",
  "marketing-assets",
] as const;

export type AnonPublicStorageBucket = (typeof ANON_PUBLIC_STORAGE_BUCKETS)[number];

/** Buckets that must never be served from the public API route. */
export const PRIVATE_STORAGE_BUCKETS = ["customer-avatars", "experience-submissions"] as const;

export type PrivateStorageBucket = (typeof PRIVATE_STORAGE_BUCKETS)[number];

export function isAnonPublicStorageBucket(bucket: string): bucket is AnonPublicStorageBucket {
  return (ANON_PUBLIC_STORAGE_BUCKETS as readonly string[]).includes(bucket);
}

export function isPrivateStorageBucketName(bucket: string): bucket is PrivateStorageBucket {
  return (PRIVATE_STORAGE_BUCKETS as readonly string[]).includes(bucket);
}

function assertSafePath(path: string): string | null {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return null;
  }
  return path;
}

/**
 * Validates public storage access via DB RPC — no direct reads on cafe_settings or other staff tables.
 * Uses caller session (anon or authenticated); RPC runs SECURITY DEFINER internally.
 */
export async function assertAnonPublicStorageAccess(
  supabase: SupabaseClient,
  bucket: AnonPublicStorageBucket,
  storagePath: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const path = assertSafePath(storagePath);
  if (!path) {
    return { ok: false, status: 400, error: "Invalid path" };
  }

  if (isPrivateStorageBucketName(bucket)) {
    return { ok: false, status: 403, error: "Private bucket not allowed on public endpoint" };
  }

  if (!isAnonPublicStorageBucket(bucket)) {
    return { ok: false, status: 400, error: "Unknown or disallowed bucket" };
  }

  const { data, error } = await supabase.rpc("can_access_public_storage_object", {
    p_bucket: bucket,
    p_storage_path: path,
  });

  if (error) {
    return { ok: false, status: 403, error: "Access check failed" };
  }

  if (!data) {
    return { ok: false, status: 403, error: "Object not published or path mismatch" };
  }

  return { ok: true };
}
