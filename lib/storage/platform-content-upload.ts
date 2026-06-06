import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import type { PlatformMediaPlacement } from "@/lib/data/platform-content";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const ACCEPTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

function safeExtension(file: File) {
  const typeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };
  return typeMap[file.type];
}

export async function uploadPlatformMedia(input: {
  placement: PlatformMediaPlacement;
  file: File;
  altText: string;
}) {
  const user = await requirePlatformAdmin();
  const { placement, file, altText } = input;

  const isImage = ACCEPTED_IMAGE_TYPES.has(file.type);
  const isVideo = ACCEPTED_VIDEO_TYPES.has(file.type);

  if (!isImage && !isVideo) {
    throw new Error("ارفع صورة أو فيديو بصيغة مدعومة");
  }
  if (placement === "intro_video" && !isVideo) {
    throw new Error("الفيديو التعريفي يقبل ملفات الفيديو فقط");
  }
  if (placement !== "intro_video" && !isImage) {
    throw new Error("هذا القسم يقبل الصور فقط");
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new Error("حجم الصورة يتجاوز 20MB");
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error("حجم الفيديو يتجاوز 120MB");
  }

  const ext = safeExtension(file);
  if (!ext) throw new Error("امتداد الملف غير مدعوم");

  const storagePath = `${placement}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();

  const { error: uploadError } = await admin.storage
    .from("platform-media")
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const supabase = await createClient();

  if (placement === "intro_video") {
    const { error: disableError } = await supabase
      .from("platform_media_assets")
      .update({ active: false })
      .eq("placement", "intro_video")
      .eq("active", true);
    if (disableError) throw disableError;
  }

  const { error } = await supabase.from("platform_media_assets").insert({
    placement,
    media_type: isVideo ? "video" : "image",
    storage_path: storagePath,
    mime_type: file.type,
    alt_text: altText.trim(),
    active: true,
    created_by: user.id,
  });

  if (error) {
    await admin.storage.from("platform-media").remove([storagePath]);
    throw error;
  }
}


export async function uploadSocialPostMedia(postId: string, files: File[]) {
  await requirePlatformAdmin();
  if (files.length > 10) throw new Error("الحد الأقصى عشرة ملفات لكل منشور");

  const admin = createAdminClient();
  const supabase = await createClient();

  for (const [index, file] of files.entries()) {
    const isImage = ACCEPTED_IMAGE_TYPES.has(file.type);
    const isVideo = ACCEPTED_VIDEO_TYPES.has(file.type);
    if (!isImage && !isVideo) throw new Error("ارفع صورة أو فيديو بصيغة مدعومة");
    if (isImage && file.size > MAX_IMAGE_BYTES) throw new Error("حجم الصورة يتجاوز 20MB");
    if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error("حجم الفيديو يتجاوز 120MB");
    const ext = safeExtension(file);
    if (!ext) throw new Error("امتداد الملف غير مدعوم");

    const path = `social_post/${postId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from("platform-media")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { error } = await supabase.from("platform_social_post_media").insert({
      post_id: postId,
      storage_path: path,
      media_type: isVideo ? "video" : "image",
      mime_type: file.type,
      sort_order: index,
    });
    if (error) {
      await admin.storage.from("platform-media").remove([path]);
      throw error;
    }
  }
}
