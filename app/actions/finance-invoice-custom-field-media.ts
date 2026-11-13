"use server";

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getBrandFinanceContext } from '@/lib/data/brand-finance';
import { canFinance } from '@/lib/finance/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { actionResult } from '@/lib/platform/action-result';
import { COMPANY_FILE_BUCKET, COMPANY_FILE_LIMIT } from '@/lib/finance/company-invoice-options';
import { invoiceCustomFieldStateSchema, invoiceCustomFieldMediaSchema } from '@/lib/finance/invoice-custom-fields';
import { inspectCustomFieldFile, resizeCustomFieldImage } from '@/lib/finance/invoice-custom-field-media';

type Stored = { id: string; original_name: string; size_bytes: number; storage_path: string; uploaded: boolean };
export async function verifyInvoiceCustomFieldFileAction(slug: string, input: { fieldId: string; settingsRevision: number; fileId: string }) {
  return actionResult(async () => {
    const parsed = z.object({ fieldId: z.uuid(), settingsRevision: z.number().int().min(1), fileId: z.uuid() }).strict().parse(input);
    const { client, cafe } = await getBrandFinanceContext(slug);
    if (!canFinance(cafe.role, 'accounting_write')) throw new Error('لا تملك صلاحية إدارة حقول الفاتورة');
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('سجل الدخول أولًا');
    const settings = await client.rpc('brand_finance_invoice_custom_fields', { p_cafe_id: cafe.id });
    if (settings.error) throw new Error('تعذر تحميل إعدادات الحقول');
    const state = invoiceCustomFieldStateSchema.parse(settings.data);
    if (state.revision !== parsed.settingsRevision) throw new Error('تغيرت إعدادات الحقول أعد تحميلها قبل رفع الملف');
    const field = state.settings.fields.find(item => item.id === parsed.fieldId);
    if (!field || !['file_upload', 'image_upload'].includes(field.type)) throw new Error('حقل الملف غير متاح');
    const fileResult = await client.rpc('brand_finance_company_file', { p_cafe_id: cafe.id, p_action: 'get', p_id: parsed.fileId });
    if (fileResult.error || !fileResult.data) throw new Error('الملف غير متاح');
    const source = fileResult.data as Stored;
    if (!source.uploaded || source.size_bytes < 1 || source.size_bytes > COMPANY_FILE_LIMIT) throw new Error('لم يكتمل رفع الملف أو تجاوز الحجم المسموح');
    const admin = createAdminClient();
    const downloaded = await admin.storage.from(COMPANY_FILE_BUCKET).download(source.storage_path);
    if (downloaded.error || !downloaded.data || downloaded.data.size !== Number(source.size_bytes)) throw new Error('تعذر التحقق من الملف المرفوع');
    const original = Buffer.from(await downloaded.data.arrayBuffer());
    const detected = await inspectCustomFieldFile(original, source.original_name);
    if (field.type === 'image_upload' && !detected.image) throw new Error('اختر صورة صالحة لهذا الحقل');
    if (field.type === 'file_upload' && field.fileTypes.length && !detected.categories.some(category => field.fileTypes.includes(category))) throw new Error('نوع الملف غير مسموح لهذا الحقل');
    const storeImage = async (bytes: Buffer, suffix: string) => {
      if (bytes.length > COMPANY_FILE_LIMIT) throw new Error('الصورة المعالجة تتجاوز الحجم المسموح');
      const id = randomUUID();
      const prepared = await client.rpc('brand_finance_company_file', { p_cafe_id: cafe.id, p_action: 'prepare', p_id: id, p_name: `${source.original_name.replace(/\.[^.]+$/, '').slice(0, 210)}-${suffix}.jpg`, p_size: bytes.length });
      if (prepared.error || !prepared.data) throw new Error('تعذر تجهيز الصورة المعالجة');
      const target = prepared.data as Stored;
      const upload = await admin.storage.from(COMPANY_FILE_BUCKET).upload(target.storage_path, bytes, { contentType: 'application/octet-stream', upsert: false });
      if (upload.error) throw new Error('تعذر حفظ الصورة المعالجة');
      const finalized = await client.rpc('brand_finance_company_file', { p_cafe_id: cafe.id, p_action: 'finalize', p_id: id });
      if (finalized.error || !finalized.data) throw new Error('تعذر تأكيد حفظ الصورة المعالجة');
      return finalized.data as Stored;
    };
    let bytes: Buffer = original;
    let file = source, thumbnail: Stored | null = null, mime = detected.mime;
    if (field.type === 'image_upload' && field.image.enabled) {
      bytes = await resizeCustomFieldImage(original, field.image.large);
      file = await storeImage(bytes, 'large');
      thumbnail = await storeImage(await resizeCustomFieldImage(original, field.image.thumbnail), 'thumbnail');
      mime = 'image/jpeg';
    }
    const registered = await admin.rpc('brand_finance_register_custom_field_media', {
      p_cafe_id: cafe.id, p_field_id: field.id, p_settings_revision: state.revision, p_actor_id: user.id,
      p_file_id: file.id, p_source_file_id: source.id, p_thumbnail_file_id: thumbnail?.id ?? null,
      p_kind: field.type === 'image_upload' ? 'image' : 'file', p_mime: mime,
      p_sha256: createHash('sha256').update(bytes).digest('hex'), p_size: bytes.length, p_categories: detected.categories,
    });
    if (registered.error) throw new Error('تعذر تأكيد الملف للحقل ربما تغيرت الإعدادات أعد تحميلها');
    return { ...invoiceCustomFieldMediaSchema.parse(registered.data), file: { id: file.id, name: file.original_name, size: Number(file.size_bytes) } };
  }, 'تعذر التحقق من ملف الحقل');
}
