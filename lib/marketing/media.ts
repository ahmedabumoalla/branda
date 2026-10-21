import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { MarketingError, requireMarketingContext } from "@/lib/data/marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { MARKETING_MEDIA_BUCKET, MARKETING_MEDIA_TYPES, marketingMediaSignature, validateMarketingMediaFile, type MarketingMediaMime } from "@/lib/marketing/media-rules";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), fileName: z.string().trim().min(1).max(150).regex(/^[^/\\\u0000-\u001f\u007f]+$/), mimeType: z.enum(["image/jpeg","image/png","image/webp","video/mp4"]), size: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("finalize"), mediaId: z.uuid() }).strict(),
]);
type MediaRow = { id: string; cafe_id: string; storage_path: string; file_name: string; mime_type: MarketingMediaMime; byte_size: number; status: string; expires_at: string };
function summary(row: MediaRow) { return { id: row.id, kind: MARKETING_MEDIA_TYPES[row.mime_type].kind, mimeType: row.mime_type, fileName: row.file_name, size: row.byte_size }; }

export async function runMarketingMediaAction(value: unknown) {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) throw new MarketingError("بيانات المرفق غير صحيحة");
  const input = parsed.data;
  const context = await requireMarketingContext();
  if (!context.eligible) throw new MarketingError("فعّل باقة الحملات لإرفاق الوسائط", 403);
  const { data: connection, error: connectionError } = await context.db.from("brand_marketing_connections").select("status,requested_phone,verified_phone").eq("cafe_id", context.cafeId).maybeSingle();
  if (connectionError || connection?.status !== "connected" || connection.requested_phone !== connection.verified_phone) throw new MarketingError("اربط رقم العلامة قبل رفع المرفق", 409);
  const storage = context.db.storage.from(MARKETING_MEDIA_BUCKET);
  if (input.action === "prepare") {
    if (!validateMarketingMediaFile(input)) throw new MarketingError("حجم الصورة يتجاوز ١٠ ميجابايت أو الفيديو يتجاوز ٥٠ ميجابايت");
    const { data, error } = await context.db.rpc("marketing_prepare_media", { p_cafe: context.cafeId, p_actor: context.userId, p_id: randomUUID(), p_name: input.fileName, p_mime: input.mimeType, p_size: input.size });
    if (error || !data) throw new MarketingError("تعذر تجهيز الرفع حاول لاحقًا", 409);
    const row = data as MediaRow;
    const signed = await storage.createSignedUploadUrl(row.storage_path, { upsert: false });
    if (signed.error || !signed.data) throw new MarketingError("تعذر تجهيز رفع المرفق", 503);
    return { mediaId: row.id, bucket: MARKETING_MEDIA_BUCKET, upload: { path: row.storage_path, token: signed.data.token } };
  }
  const { data, error } = await context.db.from("brand_marketing_media").select("id,cafe_id,storage_path,file_name,mime_type,byte_size,status,expires_at").eq("id", input.mediaId).eq("cafe_id", context.cafeId).maybeSingle();
  if (error || !data) throw new MarketingError("المرفق غير متاح لهذه العلامة", 404);
  const row = data as MediaRow;
  if (row.status === "ready") return { media: summary(row) };
  if (Date.parse(row.expires_at) <= Date.now()) throw new MarketingError("انتهت مهلة الرفع اختر الملف مجددًا", 409);
  const info = await storage.info(row.storage_path);
  if (info.error || !info.data || Number(info.data.size) !== row.byte_size || info.data.contentType !== row.mime_type) throw new MarketingError("بيانات الملف المرفوع لا تطابق المرفق المختار");
  const downloaded = await storage.download(row.storage_path);
  if (downloaded.error || !downloaded.data) throw new MarketingError("تعذر التحقق من الملف المرفوع", 503);
  if (downloaded.data.size !== row.byte_size || !validateMarketingMediaFile({ mimeType: row.mime_type, size: downloaded.data.size })) throw new MarketingError("حجم المرفق غير صحيح");
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  if (!marketingMediaSignature(bytes, row.mime_type)) throw new MarketingError("محتوى الملف لا يطابق نوع الصورة أو الفيديو");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const finalPath = `${context.cafeId}/ready/${row.id}.${MARKETING_MEDIA_TYPES[row.mime_type].extension}`;
  // Persist exactly the validated bytes at a server-only path, never the signed-upload target
  const sealed = await storage.upload(finalPath, bytes, { contentType: row.mime_type, upsert: false, cacheControl: "3600" });
  if (sealed.error) {
    const prior = await storage.download(finalPath);
    if (prior.error || !prior.data || prior.data.size !== bytes.byteLength || createHash("sha256").update(new Uint8Array(await prior.data.arrayBuffer())).digest("hex") !== hash) throw new MarketingError("تعذر حفظ المرفق النهائي أعد المحاولة", 503);
  }
  const saved = await context.db.from("brand_marketing_media").update({ status: "ready", storage_path: finalPath, content_sha256: hash, ready_at: new Date().toISOString() }).eq("id", row.id).eq("cafe_id", context.cafeId).eq("status", "uploading").select("id");
  if (saved.error || !saved.data?.length) throw new MarketingError("تعذر تأكيد حفظ المرفق أعد المحاولة", 409);
  return { media: summary(row) };
}

/** Sign only a validated immutable object owned by the queued campaign's tenant */
export async function signMarketingMedia(cafeId: string, mediaId: string) {
  const db = createAdminClient();
  const { data: row, error } = await db.from("brand_marketing_media").select("storage_path,mime_type,status,content_sha256").eq("id", mediaId).eq("cafe_id", cafeId).eq("status", "ready").maybeSingle();
  if (error || !row || !row.content_sha256 || !String(row.storage_path).startsWith(`${cafeId}/ready/${mediaId}.`)) throw new Error("MARKETING_MEDIA_UNAVAILABLE");
  const rule = MARKETING_MEDIA_TYPES[row.mime_type as MarketingMediaMime];
  if (!rule) throw new Error("MARKETING_MEDIA_INVALID");
  // Provider queues may fetch after dispatch; the URL still expires and grants only this object
  const signed = await db.storage.from(MARKETING_MEDIA_BUCKET).createSignedUrl(row.storage_path, 48 * 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("MARKETING_MEDIA_UNAVAILABLE");
  return { url: signed.data.signedUrl, fileName: `campaign.${rule.extension}` };
}
