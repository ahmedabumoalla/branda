import "server-only";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { attachmentName, FINANCE_ATTACHMENT_BUCKET, type FinanceShiftAttachment } from "@/lib/finance/shift-attachments";

type StoredAttachment = { id: string; original_name: string; size_bytes: number; content_type: string; storage_path: string; uploaded: boolean };
const uploadSchema = z.object({ shiftId: z.uuid(), name: z.string().min(1).max(255), mime: z.string().max(255), size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const publicAttachment = (a: StoredAttachment): FinanceShiftAttachment => ({ id: a.id, name: a.original_name, size: Number(a.size_bytes), mime: a.content_type });

export async function prepareShiftAttachment(slug: string, input: unknown) {
  const value = uploadSchema.parse(input);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const storage = createAdminClient().storage;
  const { data: bucket, error: bucketError } = await storage.getBucket(FINANCE_ATTACHMENT_BUCKET);
  if (bucketError || !bucket || bucket.public) throw new Error("تخزين المستندات الخاص غير جاهز");
  const limit = Number(bucket.file_size_limit);
  if (limit > 0 && value.size > limit) throw new Error("حجم الملف يتجاوز الحد المتاح في خدمة التخزين");
  const { data, error } = await client.rpc("brand_finance_prepare_shift_attachment", {
    p_cafe_id: cafe.id, p_shift_id: value.shiftId, p_name: attachmentName(value.name), p_mime: value.mime || "application/octet-stream", p_size: value.size,
  });
  if (error || !data) throw new Error("رفع المرفقات متاح لصاحب الوردية المفتوحة فقط");
  const attachment = data as StoredAttachment;
  const { data: upload, error: uploadError } = await storage.from(FINANCE_ATTACHMENT_BUCKET).createSignedUploadUrl(attachment.storage_path, { upsert: false });
  if (uploadError || !upload) throw new Error("تعذر تجهيز الرفع حاول مجددًا");
  return { attachment: publicAttachment(attachment), path: upload.path, token: upload.token };
}

export async function getShiftAttachment(slug: string, id: string) {
  z.uuid().parse(id);
  const { client, cafe } = await getBrandFinanceContext(slug);
  const { data, error } = await client.rpc("brand_finance_shift_attachment", { p_cafe_id: cafe.id, p_attachment_id: id });
  if (error || !data) throw new Error("المرفق غير متاح لهذا الحساب");
  return { client, cafe, attachment: data as StoredAttachment };
}

export async function finalizeShiftAttachment(slug: string, id: string) {
  const { client, cafe, attachment } = await getShiftAttachment(slug, id);
  const { data: info, error: infoError } = await createAdminClient().storage.from(FINANCE_ATTACHMENT_BUCKET).info(attachment.storage_path);
  if (infoError || !info || Number(info.size) !== Number(attachment.size_bytes)) throw new Error("لم يكتمل رفع الملف أعد المحاولة");
  const { data, error } = await client.rpc("brand_finance_shift_attachment", { p_cafe_id: cafe.id, p_attachment_id: id, p_finalize: true });
  if (error || !data) throw new Error("تعذر ربط الملف بالوردية المفتوحة");
  return publicAttachment(data as StoredAttachment);
}

export async function downloadShiftAttachment(slug: string, id: string) {
  const { attachment } = await getShiftAttachment(slug, id);
  if (!attachment.uploaded) throw new Error("الملف لم يكتمل رفعه");
  const { data, error } = await createAdminClient().storage.from(FINANCE_ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 60, { download: attachmentName(attachment.original_name) });
  if (error || !data) throw new Error("تعذر تنزيل الملف");
  return data.signedUrl;
}
