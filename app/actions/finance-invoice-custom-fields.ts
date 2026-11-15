"use server";

import { z } from "zod";
import { getBrandFinanceContext } from "@/lib/data/brand-finance";
import { canFinance } from "@/lib/finance/permissions";
import { actionResult } from "@/lib/platform/action-result";
import { invoiceCustomFieldStateSchema, invoiceCustomFieldContextSchema, invoiceCustomFieldValuesInputSchema, invoiceCustomFieldValuesSavedSchema, issuedInvoiceCustomFieldsSchema, invoiceCustomFieldQueryInputSchema, invoiceCustomFieldQuerySchema, type InvoiceCustomFieldSettings, type InvoiceCustomFieldValuesInput, type InvoiceCustomFieldQueryInput, type InvoiceCustomFieldSaveResult } from "@/lib/finance/invoice-custom-fields";

async function context(slug: string, write: 'settings' | 'values' | null = null) {
  const result = await getBrandFinanceContext(slug);
  if (write ? !canFinance(result.cafe.role, write === 'settings' ? 'settings_manage' : 'accounting_write') : !['owner', 'manager', 'accountant', 'auditor'].includes(result.cafe.role)) throw new Error('لا تملك صلاحية إدارة حقول الفواتير');
  return result;
}
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === '40001') throw new Error('تغيرت بيانات الحقول أعد تحميلها قبل الحفظ');
  if (error.code === '42501') throw new Error('لا تملك صلاحية الوصول إلى هذه الحقول');
  if (error.code === 'PGRST202' || error.code === '42883') throw new Error('تحديث حقول الفواتير لم يفعّل في قاعدة البيانات بعد');
  if (error.code === '22023' && error.message && /[\u0600-\u06ff]/u.test(error.message)) throw new Error(error.message);
  throw new Error('تعذر تأكيد بيانات حقول الفاتورة أعد المحاولة');
}
type CustomFieldContext = Awaited<ReturnType<typeof context>>;
type DatabaseError = { code?: string; message?: string } | null;
const customFieldTables = ['bf_invoice_custom_field_settings', 'bf_invoice_custom_field_events', 'bf_invoice_custom_field_drafts', 'bf_invoice_custom_fields', 'bf_invoice_custom_field_values', 'bf_invoice_custom_field_media'] as const;
function missingFunction(error: DatabaseError, name: string) {
  // An undefined dependency inside an installed RPC (42883) is not an absent feature.
  return error?.code === 'PGRST202' && error.message?.includes(`public.${name}(`) === true;
}
async function readCustomFieldContext({ client, cafe }: CustomFieldContext, draftId: string | null) {
  const result = await client.rpc('brand_finance_invoice_custom_field_context', { p_cafe_id: cafe.id, p_draft_id: draftId });
  if (!missingFunction(result.error, 'brand_finance_invoice_custom_field_context')) {
    check(result.error);
    return { ...invoiceCustomFieldContextSchema.parse(result.data), supported: true };
  }
  // A missing context RPC alone may be a partial installation. Probe every feature
  // table without retrieving rows, using the same freshly authorized tenant client.
  const [settings, ...tables] = await Promise.all([
    client.rpc('brand_finance_invoice_custom_fields', { p_cafe_id: cafe.id }),
    ...customFieldTables.map(table => client.from(table).select('cafe_id').eq('cafe_id', cafe.id).limit(0)),
  ]);
  const absent = missingFunction(settings.error, 'brand_finance_invoice_custom_fields') && tables.every((table, index) => table.error?.code === 'PGRST205' && table.error.message.includes(`'public.${customFieldTables[index]}'`));
  if (!absent) {
    const unavailable = [settings, ...tables].find(probe => probe.error && !['PGRST202', 'PGRST205'].includes(probe.error.code));
    if (unavailable) check(unavailable.error);
    throw new Error('تعذر التحقق من تفعيل حقول الفاتورة أعد المحاولة قبل الحفظ');
  }
  return invoiceCustomFieldContextSchema.parse({ supported: false, settings: { title: 'المزيد من معلومات الفاتورة', fields: [] }, settingsRevision: 0, savedSettings: null, savedSettingsRevision: null, values: {}, revision: 0, hasSelection: false, issued: false });
}
export async function getFinanceInvoiceCustomFields(slug: string) {
  return actionResult(async () => { const { client, cafe } = await context(slug); const { data, error } = await client.rpc('brand_finance_invoice_custom_fields', { p_cafe_id: cafe.id }); check(error); return invoiceCustomFieldStateSchema.parse(data); }, 'تعذر تحميل حقول الفواتير');
}
export async function saveFinanceInvoiceCustomFields(slug: string, settings: InvoiceCustomFieldSettings, revision: number) {
  return actionResult(async () => {
    const input = invoiceCustomFieldStateSchema.safeParse({ settings, revision });
    if (!input.success) throw new Error(input.error.issues[0]?.message ?? 'راجع إعدادات الحقول');
    const { client, cafe } = await context(slug, 'settings');
    const { data, error } = await client.rpc('brand_finance_invoice_custom_fields', { p_cafe_id: cafe.id, p_action: 'save', p_settings: input.data.settings, p_revision: input.data.revision });
    check(error); return invoiceCustomFieldStateSchema.parse(data);
  }, 'تعذر حفظ حقول الفواتير');
}
export async function getFinanceInvoiceCustomFieldContext(slug: string, draftId: string | null = null) {
  return actionResult(async () => { const id = z.uuid().nullable().parse(draftId); return readCustomFieldContext(await context(slug), id); }, 'تعذر تحميل حقول المسودة');
}
export async function saveFinanceInvoiceCustomFieldValues(slug: string, input: InvoiceCustomFieldValuesInput) {
  return actionResult<InvoiceCustomFieldSaveResult>(async () => {
    const parsed = invoiceCustomFieldValuesInputSchema.safeParse(input); if (!parsed.success) throw new Error('راجع قيم الحقول ونسخة المسودة');
    const { client, cafe } = await context(slug, 'values'); const p = parsed.data;
    const { data, error } = await client.rpc('brand_finance_set_invoice_custom_fields', { p_cafe_id: cafe.id, p_draft_id: p.draftId, p_draft_revision: p.draftRevision, p_revision: p.revision, p_settings_revision: p.settingsRevision, p_values: p.values });
    if (missingFunction(error, 'brand_finance_set_invoice_custom_fields') && Object.keys(p.values).length === 0 && p.revision === 0 && p.settingsRevision === 0) {
      const current = await readCustomFieldContext({ client, cafe }, p.draftId);
      if (!current.supported) return { supported: false, skipped: true };
    }
    check(error); return { ...invoiceCustomFieldValuesSavedSchema.parse(data), supported: true, skipped: false };
  }, 'تعذر حفظ قيم حقول الفاتورة');
}
export async function getFinanceIssuedCustomFields(slug: string, documentId: string) {
  return actionResult(async () => { const id = z.uuid().parse(documentId); const { client, cafe } = await context(slug); const { data, error } = await client.rpc('brand_finance_issued_custom_fields', { p_cafe_id: cafe.id, p_document_id: id }); check(error); return issuedInvoiceCustomFieldsSchema.parse(data); }, 'تعذر تحميل حقول الفاتورة');
}
export async function copyFinanceInvoiceCustomFields(slug: string, sourceDocumentId: string, draftId: string, draftRevision: number) {
  return actionResult(async () => {
    const parsed = z.object({ sourceDocumentId: z.uuid(), draftId: z.uuid(), draftRevision: z.number().int().positive().max(2_147_483_647) }).strict().parse({ sourceDocumentId, draftId, draftRevision });
    const { client, cafe } = await context(slug, 'values');
    const { data, error } = await client.rpc('brand_finance_copy_invoice_custom_fields', { p_cafe_id: cafe.id, p_source_document_id: parsed.sourceDocumentId, p_draft_id: parsed.draftId, p_draft_revision: parsed.draftRevision });
    check(error); return invoiceCustomFieldValuesSavedSchema.parse(data);
  }, 'تعذر نسخ حقول الفاتورة');
}
export async function queryFinanceInvoiceCustomFields(slug: string, input: InvoiceCustomFieldQueryInput) {
  return actionResult(async () => { const parsed = invoiceCustomFieldQueryInputSchema.parse(input); const { client, cafe } = await context(slug); const { data, error } = await client.rpc('brand_finance_query_invoice_custom_fields', { p_cafe_id: cafe.id, p_filters: parsed.filters, p_page: parsed.page, p_document_ids: parsed.documentIds ?? null }); check(error); return invoiceCustomFieldQuerySchema.parse(data); }, 'تعذر البحث في حقول الفواتير');
}
