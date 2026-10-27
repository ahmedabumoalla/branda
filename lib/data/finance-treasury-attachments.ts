import "server-only";
import { canFinance } from "@/lib/finance/permissions";
import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { TREASURY_ATTACHMENT_BUCKET, treasuryAttachmentName, type TreasuryAttachment } from "@/lib/finance/treasury-attachments";

type StoredAttachment = { id: string; original_name: string; size_bytes: number; storage_path: string; uploaded: boolean; created_at: string };
const publicAttachment = (a: StoredAttachment): TreasuryAttachment => ({ id: a.id, name: a.original_name, size: Number(a.size_bytes), createdAt: a.created_at });
const prepareSchema = z.object({ documentId: z.uuid(), id: z.uuid(), name: z.string().min(1).max(255), size: z.number().int().positive() });

async function context(slug: string, documentId: string) {
  z.uuid().parse(documentId);
  const result = await getBrandFinanceContext(slug);
  if (!canFinance(result.cafe.role, "reports")) throw new Error("مرفقات الخزينة متاحة لإدارة المالية فقط");
  return result;
}

export async function listTreasuryAttachments(slug: string, documentId: string) {
  const { client, cafe } = await context(slug, documentId);
  const { data, error } = await client.rpc("brand_finance_treasury_attachment", { p_cafe_id: cafe.id, p_document_id: documentId });
  if (error || !Array.isArray(data)) throw new Error("تعذر تحميل مرفقات السند");
  return (data as StoredAttachment[]).map(publicAttachment);
}

export async function prepareTreasuryAttachment(slug: string, input: unknown) {
  const value = prepareSchema.parse(input);
  const { client, cafe } = await context(slug, value.documentId);
  if (!canFinance(cafe.role, "treasury_write")) throw new Error("لا تملك صلاحية إضافة مرفقات الخزينة");
  const args = { p_cafe_id: cafe.id, p_document_id: value.documentId };
  // Cleanup is claimed atomically, only after signed upload tokens have expired
  const { data: stale, error: staleError } = await client.rpc("brand_finance_treasury_attachment", { ...args, p_action: "stale" });
  if (staleError) throw new Error("تعذر التحقق من صلاحية مرفقات السند");
  const storage = createAdminClient().storage;
  for (const old of (stale ?? []) as StoredAttachment[]) {
    const removed = await storage.from(TREASURY_ATTACHMENT_BUCKET).remove([old.storage_path]);
    if (!removed.error) await client.rpc("brand_finance_treasury_attachment", { ...args, p_action: "purge", p_id: old.id });
  }
  const { data: bucket, error: bucketError } = await storage.getBucket(TREASURY_ATTACHMENT_BUCKET);
  if (bucketError || !bucket || bucket.public) throw new Error("تخزين مرفقات الخزينة الخاص غير جاهز");
  if (Number(bucket.file_size_limit) > 0 && value.size > Number(bucket.file_size_limit)) throw new Error("حجم الملف يتجاوز الحد المتاح في التخزين");
  const { data, error } = await client.rpc("brand_finance_treasury_attachment", {
    ...args, p_action: "prepare", p_id: value.id, p_name: treasuryAttachmentName(value.name), p_size: value.size,
  });
  if (error || !data) throw new Error("تعذر تجهيز المرفق تحقق من صلاحياتك ثم أعد المحاولة");
  const attachment = data as StoredAttachment;
  if (attachment.uploaded) return { attachment: publicAttachment(attachment), uploaded: true as const };
  const { data: upload, error: uploadError } = await storage.from(TREASURY_ATTACHMENT_BUCKET).createSignedUploadUrl(attachment.storage_path, { upsert: false });
  if (uploadError || !upload) throw new Error("تعذر تجهيز رفع الملف أعد المحاولة");
  return { attachment: publicAttachment(attachment), uploaded: false as const, path: upload.path, token: upload.token };
}

export async function finalizeTreasuryAttachment(slug: string, documentId: string, id: string) {
  z.uuid().parse(id);
  const { client, cafe } = await context(slug, documentId);
  if (!canFinance(cafe.role, "treasury_write")) throw new Error("لا تملك صلاحية إضافة مرفقات الخزينة");
  const { data, error } = await client.rpc("brand_finance_treasury_attachment", { p_cafe_id: cafe.id, p_document_id: documentId, p_action: "finalize", p_id: id });
  if (error || !data) throw new Error("لم يكتمل ربط المرفق أعد المحاولة دون إعادة حفظ السند");
  return publicAttachment(data as StoredAttachment);
}

export async function downloadTreasuryAttachment(slug: string, documentId: string, id: string) {
  z.uuid().parse(id);
  const { client, cafe } = await context(slug, documentId);
  const { data, error } = await client.rpc("brand_finance_treasury_attachment", { p_cafe_id: cafe.id, p_document_id: documentId, p_action: "get", p_id: id });
  if (error || !data) throw new Error("المرفق غير متاح لهذا الحساب");
  const attachment = data as StoredAttachment;
  const { data: signed, error: downloadError } = await createAdminClient().storage.from(TREASURY_ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 60);
  if (downloadError || !signed) throw new Error("تعذر تنزيل المرفق");
  const response = await fetch(signed.signedUrl, { cache: "no-store", redirect: "error" });
  if (!response.ok || !response.body) throw new Error("تعذر تنزيل المرفق");
  // Pass the stream through the existing protected download route without buffering large files
  return { blob: response.body, name: treasuryAttachmentName(attachment.original_name) };
}
