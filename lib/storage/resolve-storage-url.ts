import { createClient } from "@/lib/supabase/server";
import {
  assertAnonPublicStorageAccess,
  isAnonPublicStorageBucket,
  isPrivateStorageBucketName,
  type AnonPublicStorageBucket,
  type PrivateStorageBucket,
} from "@/lib/storage/public-storage-access";
import { assertPrivateStorageAccess } from "@/lib/storage/private-storage-access";
import type { StorageBucket } from "@/lib/storage/upload-server";

/** Short-lived signed URLs — max 10 minutes. */
export const PRIVATE_STORAGE_TTL_SECONDS = 10 * 60;
export const PUBLIC_STORAGE_TTL_SECONDS = 10 * 60;

const PUBLISHED_BUCKETS = [
  "cafe-logos",
  "cafe-backgrounds",
  "menu-products",
  "menu-categories",
  "offer-banners",
  "marketing-assets",
] as const satisfies readonly AnonPublicStorageBucket[];

export type PublishedStorageBucket = (typeof PUBLISHED_BUCKETS)[number];

export function isPublishedStorageBucket(bucket: string): bucket is PublishedStorageBucket {
  return isAnonPublicStorageBucket(bucket);
}

/** Signed URL for published cafe assets only — never private buckets. */
export async function createPublishedAssetSignedUrl(
  bucket: PublishedStorageBucket,
  storagePath: string
): Promise<string | null> {
  if (!storagePath) return null;

  const supabase = await createClient();
  const access = await assertAnonPublicStorageAccess(supabase, bucket, storagePath);
  if (!access.ok) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, PUBLIC_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolvePublishedStoragePathToUrl(
  bucket: PublishedStorageBucket,
  storagePath: string | null | undefined
): Promise<string | undefined> {
  if (!storagePath) return undefined;
  return (await createPublishedAssetSignedUrl(bucket, storagePath)) ?? undefined;
}

/** Private buckets only — requires session + DB-backed authorization. */
export async function createPrivateAssetSignedUrl(
  bucket: PrivateStorageBucket,
  storagePath: string
): Promise<string | null> {
  if (!storagePath) return null;
  if (!isPrivateStorageBucketName(bucket)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const access = await assertPrivateStorageAccess(supabase, user, bucket, storagePath);
  if (!access.ok) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, PRIVATE_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function resolvePrivateStoragePathToUrl(
  bucket: PrivateStorageBucket,
  storagePath: string | null | undefined
): Promise<string | undefined> {
  if (!storagePath) return undefined;
  return (await createPrivateAssetSignedUrl(bucket, storagePath)) ?? undefined;
}

/**
 * @deprecated Use resolvePublishedStoragePathToUrl or resolvePrivateStoragePathToUrl.
 * Routes private buckets through authorization; rejects unknown buckets.
 */
export async function resolveStoragePathToUrl(
  bucket: StorageBucket,
  storagePath: string | null | undefined
): Promise<string | undefined> {
  if (!storagePath) return undefined;

  if (isPrivateStorageBucketName(bucket)) {
    return resolvePrivateStoragePathToUrl(bucket, storagePath);
  }

  if (isPublishedStorageBucket(bucket)) {
    return resolvePublishedStoragePathToUrl(bucket, storagePath);
  }

  return undefined;
}

export function storageBucketForLogo(): PublishedStorageBucket {
  return "cafe-logos";
}

export function storageBucketForProduct(): PublishedStorageBucket {
  return "menu-products";
}

export function storageBucketForCategory(): PublishedStorageBucket {
  return "menu-categories";
}

export function storageBucketForOfferBanner(): PublishedStorageBucket {
  return "offer-banners";
}

export function storageBucketForMarketing(): PublishedStorageBucket {
  return "marketing-assets";
}

export function storageBucketForBackground(): PublishedStorageBucket {
  return "cafe-backgrounds";
}

export function storageBucketForAvatar(): PrivateStorageBucket {
  return "customer-avatars";
}

export { PUBLISHED_BUCKETS as PUBLIC_BUCKETS };
