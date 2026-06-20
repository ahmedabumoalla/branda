"use server";

import { getCafeBySlug } from "@/lib/data/cafes";
import { mapCustomerProfileToSession } from "@/lib/data/customers";
import { getCustomerSessionAction } from "@/app/actions/auth";
import {
  deleteCustomerAvatar,
  uploadCustomerAvatar,
  validateCustomerAvatarContent,
  validateCustomerAvatarFile,
} from "@/lib/storage/customer-media-server";
import { uploadExperienceSubmissionMedia } from "@/lib/storage/experience-media-server";
import { createAdminClient } from "@/lib/supabase/admin";

const CUSTOMER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

type UploadCustomerAvatarResult =
  | {
      success: true;
      avatarStoragePath: string;
      avatarUrl: string | null;
    }
  | {
      success: false;
      error: string;
      code:
        | "missing_file"
        | "invalid_session"
        | "cafe_not_found"
        | "profile_not_found"
        | "file_too_large"
        | "unsupported_type"
        | "upload_failed"
        | "save_failed";
    };

async function createCustomerAvatarSignedUrl(storagePath: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("customer-avatars")
    .createSignedUrl(storagePath, 10 * 60);

  if (error) return null;
  return data.signedUrl;
}

function formatUploadSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export async function uploadCustomerAvatarAction(
  cafeSlug: string,
  formData: FormData,
): Promise<UploadCustomerAvatarResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "Missing file", code: "missing_file" };
    }

    if (file.size > CUSTOMER_AVATAR_MAX_BYTES) {
      return {
        success: false,
        error: `حجم الصورة ${formatUploadSize(file.size)}، الحد الأقصى ${formatUploadSize(CUSTOMER_AVATAR_MAX_BYTES)}.`,
        code: "file_too_large",
      };
    }

    const validation = validateCustomerAvatarFile(file);
    if (!validation.ok) {
      return {
        success: false,
        error: validation.error,
        code: validation.code === "file_too_large" ? "file_too_large" : "unsupported_type",
      };
    }
    if (!(await validateCustomerAvatarContent(file, validation.mime))) {
      return { success: false, error: "Unsupported image type", code: "unsupported_type" };
    }

    const session = await getCustomerSessionAction(cafeSlug);
    if (!session) {
      return { success: false, error: "Unauthorized", code: "invalid_session" };
    }

    const cafe = await getCafeBySlug(cafeSlug);
    if (!cafe) {
      return { success: false, error: "Cafe not found", code: "cafe_not_found" };
    }

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("customer_profiles")
      .select("id,cafe_id,avatar_storage_path")
      .eq("id", session.id)
      .eq("cafe_id", cafe.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: "Profile not found", code: "profile_not_found" };
    }

    const { storagePath, previousStoragePath } = await uploadCustomerAvatar(file, {
      cafeId: cafe.id,
      customerId: session.id,
      previousStoragePath: (profile.avatar_storage_path as string | null | undefined) ?? null,
    });

    const { error: updateError } = await admin
      .from("customer_profiles")
      .update({
        avatar_storage_path: storagePath,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .eq("cafe_id", cafe.id);

    if (updateError) {
      await deleteCustomerAvatar(storagePath).catch(() => {});
      return { success: false, error: "Unable to save avatar", code: "save_failed" };
    }

    if (previousStoragePath && previousStoragePath !== storagePath) {
      await deleteCustomerAvatar(previousStoragePath).catch(() => {});
    }

    return {
      success: true,
      avatarStoragePath: storagePath,
      avatarUrl: await createCustomerAvatarSignedUrl(storagePath),
    };
  } catch (error) {
    console.error("[uploadCustomerAvatarAction]", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return { success: false, error: "Unable to upload avatar", code: "upload_failed" };
  }
}

/** Updates name/phone only; avatar changes go through uploadCustomerAvatarAction. */
export async function updateCustomerProfileAction(
  cafeSlug: string,
  input: { fullName: string; email?: string; phone?: string },
) {
  const session = await getCustomerSessionAction(cafeSlug);
  if (!session) throw new Error("Unauthorized");

  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const updatePayload: Record<string, string | null> = {
    full_name: input.fullName.trim(),
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
    .eq("cafe_id", cafe.id)
    .single();

  if (fetchError || !data) throw fetchError ?? new Error("Profile not found");

  const updatedSession = mapCustomerProfileToSession(cafeSlug, data);
  if (data.avatar_storage_path) {
    const signedUrl = await createCustomerAvatarSignedUrl(data.avatar_storage_path as string);
    if (signedUrl) updatedSession.avatarUrl = signedUrl;
    updatedSession.avatarAssetId = data.avatar_storage_path as string;
  }

  return updatedSession;
}

export async function uploadExperienceMediaAction(
  cafeSlug: string,
  submissionId: string,
  formData: FormData,
) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("Missing file");
  }

  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  return uploadExperienceSubmissionMedia(cafeSlug, submissionId, file);
}
