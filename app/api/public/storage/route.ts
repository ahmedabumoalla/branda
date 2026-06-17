import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ANON_PUBLIC_STORAGE_BUCKETS,
  assertAnonPublicStorageAccess,
  isAnonPublicStorageBucket,
  isPrivateStorageBucketName,
} from "@/lib/storage/public-storage-access";
import { PUBLIC_STORAGE_TTL_SECONDS } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";
import { immutableAssetCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

const querySchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
});

type SignedStoragePayload = {
  url: string;
  expiresIn: number;
  bucket: string;
  allowedBuckets: typeof ANON_PUBLIC_STORAGE_BUCKETS;
};

async function createPublishedSignedUrl(bucket: (typeof ANON_PUBLIC_STORAGE_BUCKETS)[number], path: string): Promise<SignedStoragePayload> {
  const supabase = await createClient();
  const access = await assertAnonPublicStorageAccess(supabase, bucket, path);
  if (!access.ok) {
    throw Object.assign(new Error(access.error), { status: access.status });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, PUBLIC_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw Object.assign(new Error("Forbidden or not found"), { status: 403 });
  }

  return {
    url: data.signedUrl,
    expiresIn: PUBLIC_STORAGE_TTL_SECONDS,
    bucket,
    allowedBuckets: ANON_PUBLIC_STORAGE_BUCKETS,
  };
}

/**
 * Anonymous public signed URLs for published cafe assets only.
 * Never serves customer-avatars or experience-submissions.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    bucket: url.searchParams.get("bucket"),
    path: url.searchParams.get("path"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bucket or path" }, { status: 400 });
  }

  const { bucket, path } = parsed.data;

  if (isPrivateStorageBucketName(bucket)) {
    return NextResponse.json(
      { error: "Private bucket requires authenticated session" },
      { status: 403 },
    );
  }

  if (!isAnonPublicStorageBucket(bucket)) {
    return NextResponse.json({ error: "Unknown or disallowed bucket" }, { status: 400 });
  }

  try {
    const payload = await cachedServerValue(
      `public-storage:${bucket}:${path}`,
      Math.max(60_000, (PUBLIC_STORAGE_TTL_SECONDS - 120) * 1000),
      () => createPublishedSignedUrl(bucket, path),
    );

    return NextResponse.json(payload, {
      headers: { "Cache-Control": immutableAssetCacheHeader(PUBLIC_STORAGE_TTL_SECONDS) },
    });
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? Number((error as { status?: unknown }).status) : 403;
    const message = error instanceof Error ? error.message : "Forbidden or not found";
    return NextResponse.json({ error: message }, { status });
  }
}
