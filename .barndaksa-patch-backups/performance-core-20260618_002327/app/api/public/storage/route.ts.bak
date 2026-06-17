import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ANON_PUBLIC_STORAGE_BUCKETS,
  assertAnonPublicStorageAccess,
  isAnonPublicStorageBucket,
  isPrivateStorageBucketName,
} from "@/lib/storage/public-storage-access";
import { PRIVATE_STORAGE_TTL_SECONDS } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";
import { immutableAssetCacheHeader } from "@/lib/performance/server-cache";

const querySchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
});

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
      { status: 403 }
    );
  }

  if (!isAnonPublicStorageBucket(bucket)) {
    return NextResponse.json({ error: "Unknown or disallowed bucket" }, { status: 400 });
  }

  const supabase = await createClient();
  const access = await assertAnonPublicStorageAccess(supabase, bucket, path);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, PRIVATE_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
  }

  return NextResponse.json(
    {
      url: data.signedUrl,
      expiresIn: PRIVATE_STORAGE_TTL_SECONDS,
      bucket,
      allowedBuckets: ANON_PUBLIC_STORAGE_BUCKETS,
    },
    { headers: { "Cache-Control": immutableAssetCacheHeader() } }
  );
}
