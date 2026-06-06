"use server";

import { getCafeBySlug } from "@/lib/data/cafes";
import { requireCustomerProfileForSession, mapCustomerProfileToSession } from "@/lib/data/customers";
import { uploadCustomerAvatar, deleteCustomerAvatar } from "@/lib/storage/customer-media-server";
import { uploadExperienceSubmissionMedia } from "@/lib/storage/experience-media-server";
import { resolvePrivateStoragePathToUrl, storageBucketForAvatar } from "@/lib/storage/resolve-storage-url";
import { createClient } from "@/lib/supabase/server";
import type { BrandaCustomerSession } from "@/lib/customer/session";

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
  } satisfies BrandaCustomerSession;
}

/** Updates name/email/phone only — avatar changes go through uploadCustomerAvatarAction. */
export async function updateCustomerProfileAction(
  cafeSlug: string,
  input: { fullName: string; email?: string; phone?: string }
) {
  const { profile } = await requireCustomerProfileForSession(cafeSlug);
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_customer_profile", {
    p_cafe_id: cafe.id,
    p_full_name: input.fullName.trim(),
    p_email: input.email?.trim() || null,
    p_phone: input.phone?.trim() || null,
  });

  if (error) throw error;

  const { data, error: fetchError } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", profile.id)
    .single();

  if (fetchError || !data) throw fetchError ?? new Error("Profile not found");

  const session = mapCustomerProfileToSession(cafeSlug, data);
  if (data.avatar_storage_path) {
    session.avatarUrl = await resolvePrivateStoragePathToUrl(
      storageBucketForAvatar(),
      data.avatar_storage_path as string
    );
    session.avatarAssetId = data.avatar_storage_path as string;
  }

  return session;
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
