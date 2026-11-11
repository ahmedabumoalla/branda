"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { actionResult } from "@/lib/platform/action-result";
import { treasuryAttachmentName } from "@/lib/finance/treasury-attachments";
import { COMPANY_FILE_BUCKET, COMPANY_FILE_LIMIT, type InvoiceFile } from "@/lib/finance/company-invoice-options";

type Stored = { id: string; original_name: string; size_bytes: number; storage_path: string; uploaded: boolean };
const publicFile = (file: Stored): InvoiceFile => ({ id: file.id, name: file.original_name, size: Number(file.size_bytes) });
async function context(slug: string) {
  const context = await getBrandFinanceContext(slug);
  if (!canFinance(context.cafe.role, "accounting_write")) throw new Error("لا تملك صلاحية إدارة مرفقات الفواتير");
  return context;
}

export async function listInvoiceFilesAction(slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const result = await client.rpc("brand_finance_company_file", { p_cafe_id: cafe.id });
    if (result.error) throw new Error("تعذر تحميل المستندات");
    return (result.data as Stored[]).map(publicFile);
  }, "تعذر تحميل المستندات");
}

export async function prepareInvoiceFileAction(input: unknown, slug: string) {
  return actionResult(async () => {
    const parsed = z.object({ id: z.uuid(), name: z.string().min(1).max(255), size: z.number().int().min(1).max(COMPANY_FILE_LIMIT) }).strict().safeParse(input);
    if (!parsed.success) throw new Error("اختر ملفًا بحجم لا يتجاوز ٨ ميجابايت");
    const { client, cafe } = await context(slug);
    const storage = createAdminClient().storage;
    const bucket = await storage.getBucket(COMPANY_FILE_BUCKET);
    if (bucket.error || !bucket.data || bucket.data.public) throw new Error("تخزين المستندات الخاص غير جاهز");
    const result = await client.rpc("brand_finance_company_file", { p_cafe_id: cafe.id, p_action: "prepare", p_id: parsed.data.id, p_name: treasuryAttachmentName(parsed.data.name), p_size: parsed.data.size });
    if (result.error || !result.data) throw new Error("تعذر تجهيز المستند تحقق من الصلاحية والسعة المتاحة");
    const file = result.data as Stored;
    const upload = await storage.from(COMPANY_FILE_BUCKET).createSignedUploadUrl(file.storage_path, { upsert: false });
    if (upload.error || !upload.data) throw new Error("تعذر تجهيز رفع المستند");
    return { file: publicFile(file), path: upload.data.path, token: upload.data.token };
  }, "تعذر تجهيز المستند");
}

export async function finalizeInvoiceFileAction(id: string, slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const result = await client.rpc("brand_finance_company_file", { p_cafe_id: cafe.id, p_action: "finalize", p_id: z.uuid().parse(id) });
    if (result.error || !result.data) throw new Error("لم يكتمل رفع المستند أعد المحاولة");
    return publicFile(result.data as Stored);
  }, "تعذر تأكيد رفع المستند");
}

export async function invoiceFileDownloadAction(id: string, slug: string) {
  return actionResult(async () => {
    const { client, cafe } = await context(slug);
    const result = await client.rpc("brand_finance_company_file", { p_cafe_id: cafe.id, p_action: "get", p_id: z.uuid().parse(id) });
    if (result.error || !result.data) throw new Error("المستند غير متاح");
    const file = result.data as Stored;
    const signed = await createAdminClient().storage.from(COMPANY_FILE_BUCKET).createSignedUrl(file.storage_path, 60, { download: treasuryAttachmentName(file.original_name) });
    if (signed.error || !signed.data) throw new Error("تعذر تنزيل المستند");
    return signed.data.signedUrl;
  }, "تعذر تنزيل المستند");
}
