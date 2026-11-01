import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { PlatformMarketingError, requirePlatformMarketingContext } from "@/lib/data/platform-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { MARKETING_MEDIA_TYPES, marketingMediaSignature, validateMarketingMediaFile, type MarketingMediaMime } from "@/lib/marketing/media-rules";

const BUCKET = "platform-marketing-media";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), fileName: z.string().trim().min(1).max(150).regex(/^[^/\\\u0000-\u001f\u007f]+$/), mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]), size: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("finalize"), mediaId: z.uuid() }).strict(),
]);
type Media = { id: string; created_by: string; storage_path: string; file_name: string; mime_type: MarketingMediaMime; byte_size: number; status: string; expires_at: string; content_sha256: string | null };

export async function runPlatformCampaignMediaAction(raw: unknown) {
  const { db, userId } = await requirePlatformMarketingContext();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PlatformMarketingError("بيانات الصورة أو الفيديو غير صحيحة");
  const input = parsed.data, storage = db.storage.from(BUCKET);
  if (input.action === "prepare") {
    if (!validateMarketingMediaFile(input)) throw new PlatformMarketingError("الحد الأقصى للصورة ١٠ ميجابايت وللفيديو ٥٠ ميجابايت");
    const id = randomUUID(), filePath = `${userId}/upload/${id}.${MARKETING_MEDIA_TYPES[input.mimeType].extension}`;
    const row = await db.from("platform_marketing_media").insert({ id, created_by: userId, storage_path: filePath, file_name: input.fileName, mime_type: input.mimeType, byte_size: input.size, status: "uploading", expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() });
    if (row.error) throw new PlatformMarketingError("تعذر تجهيز المرفق أعد المحاولة", 503);
    const signed = await storage.createSignedUploadUrl(filePath, { upsert: false });
    if (signed.error || !signed.data) throw new PlatformMarketingError("تعذر تجهيز رفع المرفق", 503);
    return { mediaId: id, bucket: BUCKET, upload: { path: filePath, token: signed.data.token } };
  }
  const found = await db.from("platform_marketing_media").select("*").eq("id", input.mediaId).eq("created_by", userId).maybeSingle();
  if (found.error || !found.data) throw new PlatformMarketingError("المرفق غير متاح لهذا الحساب", 404);
  const row = found.data as Media;
  const finalPath = `${userId}/ready/${row.id}.${MARKETING_MEDIA_TYPES[row.mime_type].extension}`;
  if (Date.parse(row.expires_at) <= Date.now()) throw new PlatformMarketingError("انتهت مهلة المرفق أعد رفع الملف", 409);
  if (row.status !== "ready") {
    if (!row.storage_path.startsWith(`${userId}/upload/${row.id}.`)) throw new PlatformMarketingError("مسار المرفق غير صحيح", 409);
    const info = await storage.info(row.storage_path);
    if (info.error || !info.data || Number(info.data.size) !== row.byte_size || info.data.contentType !== row.mime_type) throw new PlatformMarketingError("الملف المرفوع لا يطابق الصورة أو الفيديو المختار");
    const downloaded = await storage.download(row.storage_path);
    if (downloaded.error || !downloaded.data) throw new PlatformMarketingError("تعذر التحقق من المرفق", 503);
    if (downloaded.data.size !== row.byte_size || !validateMarketingMediaFile({ mimeType: row.mime_type, size: downloaded.data.size })) throw new PlatformMarketingError("حجم المرفق غير صحيح");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (!marketingMediaSignature(bytes, row.mime_type)) throw new PlatformMarketingError("محتوى الملف لا يطابق نوعه");
    const hash = createHash("sha256").update(bytes).digest("hex");
    // Only the exact inspected bytes are sealed. A signed staging upload cannot replace them.
    const sealed = await storage.upload(finalPath, bytes, { contentType: row.mime_type, cacheControl: "3600", upsert: false });
    if (sealed.error) {
      const prior = await storage.download(finalPath);
      if (prior.error || !prior.data || prior.data.size !== bytes.byteLength || createHash("sha256").update(new Uint8Array(await prior.data.arrayBuffer())).digest("hex") !== hash) throw new PlatformMarketingError("تعذر تثبيت المرفق أعد المحاولة", 503);
    }
    const saved = await db.from("platform_marketing_media").update({ storage_path: finalPath, status: "ready", content_sha256: hash, ready_at: new Date().toISOString() }).eq("id", row.id).eq("created_by", userId).eq("status", "uploading").select("id");
    if (saved.error || !saved.data?.length) throw new PlatformMarketingError("تعذر تأكيد المرفق أعد المحاولة", 409);
    await storage.remove([row.storage_path]);
  } else if (row.storage_path !== finalPath || !row.content_sha256) throw new PlatformMarketingError("المرفق النهائي غير صالح", 409);
  const preview = await storage.createSignedUrl(finalPath, 3600);
  return { media: { id: row.id, kind: MARKETING_MEDIA_TYPES[row.mime_type].kind, mimeType: row.mime_type, fileName: row.file_name, size: row.byte_size }, previewUrl: preview.data?.signedUrl ?? null };
}

export async function signPlatformCampaignMedia(actor: string, mediaId: string) {
  const db = createAdminClient();
  const found = await db.from("platform_marketing_media").select("storage_path,mime_type,content_sha256").eq("id", mediaId).eq("created_by", actor).eq("status", "ready").maybeSingle();
  const row = found.data;
  if (found.error || !row || !row.content_sha256) throw new Error("CAMPAIGN_MEDIA_UNAVAILABLE");
  const rule = MARKETING_MEDIA_TYPES[row.mime_type as MarketingMediaMime];
  if (!rule || row.storage_path !== `${actor}/ready/${mediaId}.${rule.extension}`) throw new Error("CAMPAIGN_MEDIA_INVALID");
  const signed = await db.storage.from(BUCKET).createSignedUrl(row.storage_path, 48 * 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("CAMPAIGN_MEDIA_UNAVAILABLE");
  return { url: signed.data.signedUrl, fileName: `campaign.${rule.extension}` };
}
