import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPrivateStorageAccess } from "@/lib/storage/private-storage-access";
import { isPrivateStorageBucketName } from "@/lib/storage/public-storage-access";
import { PRIVATE_STORAGE_TTL_SECONDS } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  bucket: z.enum(["customer-avatars", "experience-submissions"]),
  path: z.string().min(1),
});

/**
 * Authenticated signed URLs for private buckets only.
 * Requires real Supabase session + DB-backed ownership/permission check.
 * TTL max 600 seconds. No service role.
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

  if (!isPrivateStorageBucketName(bucket)) {
    return NextResponse.json({ error: "Bucket not allowed on this endpoint" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const access = await assertPrivateStorageAccess(supabase, user, bucket, path);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, PRIVATE_STORAGE_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 });
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresIn: PRIVATE_STORAGE_TTL_SECONDS,
  });
}
