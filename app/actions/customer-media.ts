"use server";

import { getCafeBySlug } from "@/lib/data/cafes";
import { requireCustomerProfileForSession, mapCustomerProfileToSession } from "@/lib/data/customers";
import { getCustomerSessionAction } from "@/app/actions/auth";
import { uploadCustomerAvatar, deleteCustomerAvatar } from "@/lib/storage/customer-media-server";
import { uploadExperienceSubmissionMedia } from "@/lib/storage/experience-media-server";
import { resolvePrivateStoragePathToUrl, storageBucketForAvatar } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";

export async function uploadCustomerAvatarAction(cafeSlug: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }

  const { profile } = await requireCustomerProfileForSession(cafeSlug);
  const { storagePath, previousStoragePath } = await uploadCustomerAvatar(cafeSlug, file);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_customer_avatar_storage_path", {
    p_profile_id: profile.id,
    p_storage_path: storagePath,
  });

  if (error) {
    await supabase.storage.from("customer-avatars").remove([storagePath]);
    throw error;
  }

  if (
    previousStoragePath &&
    previousStoragePath !== storagePath
  ) {
    try {
      await deleteCustomerAvatar(previousStoragePath);
    } catch {
      // DB updated; stale object cleanup is best-effort
    }
  }

  const { data, error: fetchError } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", profile.id)
    .single();

  if (fetchError || !data) throw fetchError ?? new Error("Profile not found");

  const session = mapCustomerProfileToSession(cafeSlug, data);
  const signedUrl = await resolvePrivateStoragePathToUrl(storageBucketForAvatar(), storagePath);
  return {
    ...session,
    avatarUrl: signedUrl,
    avatarAssetId: storagePath,
  } satisfies BarndaksaCustomerSession;
}

/** Updates name/email/phone only — avatar changes go through uploadCustomerAvatarAction. */
export async function updateCustomerProfileAction(
  cafeSlug: string,
  input: { fullName: string; email?: string; phone?: string }
) {
  const session = await getCustomerSessionAction(cafeSlug);
  if (!session) throw new Error("Unauthorized");

  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const updatePayload: Record<string, string | null> = {
    full_name: input.fullName.trim(),
    email: input.email?.trim() || null,
    avatar_url: null,
    updated_at: new Date().toISOString(),
  };
  if (input.phone?.trim()) {
    updatePayload.phone = input.phone.trim();
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("customer_profiles")
    .update(updatePayload)
    .eq("id", session.id)
    .eq("cafe_id", cafe.id);

  if (error) throw error;

  const { data, error: fetchError } = await admin
    .from("customer_profiles")
    .select("*")
    .eq("id", session.id)
    .single();

  if (fetchError || !data) throw fetchError ?? new Error("Profile not found");

  const updatedSession = mapCustomerProfileToSession(cafeSlug, data);
  if (data.avatar_storage_path) {
    updatedSession.avatarUrl = await resolvePrivateStoragePathToUrl(
      storageBucketForAvatar(),
      data.avatar_storage_path as string
    );
    updatedSession.avatarAssetId = data.avatar_storage_path as string;
  }

  return updatedSession;
}

export async function uploadExperienceMediaAction(
  cafeSlug: string,
  submissionId: string,
  formData: FormData
) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }

  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  return uploadExperienceSubmissionMedia(cafeSlug, submissionId, file);
}
