import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug } from "@/lib/data/cafes";
import { requireCustomerProfileForSession } from "@/lib/data/customers";
import { optimizeImageForStorage } from "@/lib/cafe/image-asset-pipeline";

const IMAGE_MIME = ["image/webp", "image/jpeg", "image/png"];
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_FINAL_BYTES = 5 * 1024 * 1024;

const DIRECT_VIDEO_UPLOAD_DISABLED_MESSAGE =
  "رفع الفيديو المباشر غير متاح حاليًا. يمكنك إضافة رابط TikTok أو Instagram أو YouTube بدلًا من ذلك.";

function assertSafePathSegment(segment: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error("Invalid storage path segment");
  }
}

/**
 * Upload experience submission proof image after the submission row exists.
 * Path: `{userId}/{submissionId}/{uuid}.ext` — direct video upload disabled for v1.
 */
export async function uploadExperienceSubmissionMedia(
  cafeSlug: string,
  submissionId: string,
  file: File
) {
  if (file.type.startsWith("video/")) {
    throw new Error(DIRECT_VIDEO_UPLOAD_DISABLED_MESSAGE);
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("Image file is too large (max 10 MB before processing)");
  }

  const { user, profile } = await requireCustomerProfileForSession(cafeSlug);
  const cafe = await getCafeBySlug(cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  assertSafePathSegment(submissionId);

  const supabase = await createClient();
  const { data: submission } = await supabase
    .from("experience_submissions")
    .select("id, customer_id, cafe_id, status")
    .eq("id", submissionId)
    .eq("cafe_id", cafe.id)
    .maybeSingle();

  if (!submission || submission.customer_id !== profile.id) {
    throw new Error("Submission not found or forbidden");
  }

  if (submission.status !== "pending") {
    throw new Error("Submission is not editable");
  }

  const optimized = await optimizeImageForStorage(file, "product-image");
  if (!IMAGE_MIME.includes(optimized.mimeType)) {
    throw new Error("Unsupported file type — images only");
  }

  if (optimized.sizeBytes > MAX_FINAL_BYTES) {
    throw new Error("Optimized image exceeds safe size limit (max 5 MB)");
  }

  const ext = optimized.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = `${crypto.randomUUID()}.${ext}`;
  assertSafePathSegment(fileName);
  const storagePath = `${user.id}/${submissionId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("experience-submissions")
    .upload(storagePath, optimized.blob, {
      contentType: optimized.mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: attachError } = await supabase.rpc("attach_experience_submission_media", {
    p_submission_id: submissionId,
    p_media_storage_path: storagePath,
  });
  if (attachError) {
    await supabase.storage.from("experience-submissions").remove([storagePath]);
    throw attachError;
  }

  return { storagePath, byteSize: optimized.sizeBytes };
}
