import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PrivateStorageBucket } from "@/lib/storage/public-storage-access";

function assertSafePath(path: string): string | null {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return null;
  }
  return path;
}

async function isPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  return !error && Boolean(data);
}

async function isCafeOwner(supabase: SupabaseClient, cafeId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_cafe_owner", { p_cafe_id: cafeId });
  return !error && Boolean(data);
}

async function hasCafePermission(
  supabase: SupabaseClient,
  cafeId: string,
  permission: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_cafe_permission", {
    p_cafe_id: cafeId,
    p_permission: permission,
  });
  return !error && Boolean(data);
}

/**
 * DB-backed authorization before issuing signed URLs for private buckets.
 * Never uses service role — relies on user session + RPC permission checks.
 */
export async function assertPrivateStorageAccess(
  supabase: SupabaseClient,
  user: User,
  bucket: PrivateStorageBucket,
  storagePath: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const path = assertSafePath(storagePath);
  if (!path) {
    return { ok: false, status: 400, error: "Invalid path" };
  }

  const segments = path.split("/");

  if (bucket === "customer-avatars") {
    const pathUserId = segments[0];
    if (!pathUserId || !segments[1]) {
      return { ok: false, status: 400, error: "Invalid avatar path" };
    }

    if (pathUserId !== user.id) {
      if (!(await isPlatformAdmin(supabase))) {
        return { ok: false, status: 403, error: "Forbidden: path user mismatch" };
      }
    }

    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("user_id, avatar_storage_path")
      .eq("avatar_storage_path", path)
      .maybeSingle();

    if (!profile) {
      return { ok: false, status: 403, error: "Avatar path not linked in database" };
    }

    if (profile.user_id === user.id && pathUserId === user.id) {
      return { ok: true };
    }

    if (await isPlatformAdmin(supabase)) {
      return { ok: true };
    }

    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (bucket === "experience-submissions") {
    const pathUserId = segments[0];
    const submissionId = segments[1];
    if (!pathUserId || !submissionId || !segments[2]) {
      return { ok: false, status: 400, error: "Invalid experience media path" };
    }

    const { data: submission } = await supabase
      .from("experience_submissions")
      .select("id, cafe_id, customer_id, media_storage_path")
      .eq("id", submissionId)
      .maybeSingle();

    if (!submission) {
      return { ok: false, status: 403, error: "Submission not found" };
    }

    if (submission.media_storage_path !== path) {
      return { ok: false, status: 403, error: "Path does not match submission media record" };
    }

    const { data: customerProfile } = await supabase
      .from("customer_profiles")
      .select("user_id")
      .eq("id", submission.customer_id)
      .maybeSingle();

    if (customerProfile?.user_id === user.id) {
      if (pathUserId !== user.id) {
        return { ok: false, status: 403, error: "Forbidden: path user mismatch" };
      }
      return { ok: true };
    }

    if (await isPlatformAdmin(supabase)) {
      return { ok: true };
    }

    const cafeId = submission.cafe_id as string;
    if (await isCafeOwner(supabase, cafeId)) {
      return { ok: true };
    }

    if (await hasCafePermission(supabase, cafeId, "marketing")) {
      return { ok: true };
    }

    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: false, status: 400, error: "Unsupported bucket" };
}
