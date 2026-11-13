import { z } from "zod";

// Control capabilities are taken from the inspected reference dialogs, not inferred by data type.
export const invoiceCustomFieldTypes = [
  { type: "singleline", label: "سطر واحد" }, { type: "multiline", label: "سطور متعددة" },
  { type: "number", label: "رقم" }, { type: "decimal", label: "رقم عشري" },
  { type: "email", label: "البريد الإلكتروني" }, { type: "date", label: "التاريخ" },
  { type: "time", label: "الوقت" }, { type: "datetime", label: "تاريخ ووقت" },
  { type: "dropdown", label: "القائمة المنسدلة" }, { type: "multiple_dropdown", label: "القائمة متعددة الخيارات" },
  { type: "radio", label: "خيار وحيد" }, { type: "checkbox", label: "مربع الاختيار" },
  { type: "multiple_checkbox", label: "مربعات الاختيار" }, { type: "website", label: "الموقع" },
  { type: "currency", label: "العملة" }, { type: "file_upload", label: "رفع ملف" },
  { type: "image_upload", label: "رفع صورة" }, { type: "rating_input", label: "تقييم" },
  { type: "separator", label: "فاصل" }, { type: "free_static_content", label: "كتابة فاصلة" },
] as const;
export type InvoiceCustomFieldType = typeof invoiceCustomFieldTypes[number]["type"];
export type InvoiceCustomFieldCapabilities = {
  defaultValue: boolean; placeholder: boolean; autocomplete: boolean; quickSearch: boolean;
  required: boolean; unique: boolean; filterable: boolean; showInList: boolean;
  range: boolean; rangeKind: "length" | "number" | "date" | "datetime" | null;
  numberRangeMode: boolean; decimalPlaces: boolean; currency: boolean; fileTypes: boolean;
  compressImage: boolean; size: boolean; newLine: boolean; hidden: boolean; instructions: boolean; options: boolean;
};
const ordinary: InvoiceCustomFieldCapabilities = {
  defaultValue: true, placeholder: true, autocomplete: false, quickSearch: false,
  required: true, unique: true, filterable: true, showInList: true,
  range: false, rangeKind: null, numberRangeMode: false, decimalPlaces: false,
  currency: false, fileTypes: false, compressImage: false,
  size: true, newLine: true, hidden: true, instructions: true, options: false,
};
const choices = { ...ordinary, placeholder: false, unique: false, options: true };
const decoration: InvoiceCustomFieldCapabilities = {
  defaultValue: false, placeholder: false, autocomplete: false, quickSearch: false,
  required: false, unique: false, filterable: false, showInList: false,
  range: false, rangeKind: null, numberRangeMode: false, decimalPlaces: false,
  currency: false, fileTypes: false, compressImage: false,
  size: false, newLine: false, hidden: false, instructions: false, options: false,
};
export const invoiceCustomFieldCapabilities: Record<InvoiceCustomFieldType, InvoiceCustomFieldCapabilities> = {
  singleline: { ...ordinary, autocomplete: true },
  multiline: { ...ordinary, defaultValue: false, range: true, rangeKind: "length" },
  number: { ...ordinary, range: true, rangeKind: "number", numberRangeMode: true },
  decimal: { ...ordinary, range: true, rangeKind: "number", decimalPlaces: true },
  email: ordinary, date: { ...ordinary, range: true, rangeKind: "date" },
  time: { ...ordinary, placeholder: false }, datetime: { ...ordinary, range: true, rangeKind: "datetime" },
  dropdown: { ...choices, quickSearch: true }, multiple_dropdown: { ...choices, quickSearch: true },
  radio: choices, multiple_checkbox: choices,
  checkbox: { ...ordinary, placeholder: false, required: false, unique: false },
  website: ordinary,
  currency: { ...ordinary, unique: false, filterable: false, showInList: false, currency: true, range: true, rangeKind: "number" },
  file_upload: { ...ordinary, defaultValue: false, placeholder: false, unique: false, filterable: false, showInList: false, fileTypes: true },
  image_upload: { ...ordinary, defaultValue: false, placeholder: false, unique: false, filterable: false, compressImage: true },
  rating_input: { ...ordinary, required: false, unique: false, filterable: false, showInList: false },
  separator: decoration, free_static_content: decoration,
};
export const invoiceCustomFieldFileTypes = ["document", "pdf", "spreadsheet", "text", "html", "image", "archive"] as const;
const valueSchema = z.union([z.string().max(10000), z.array(z.string().max(255)).max(100), z.boolean(), z.null()]);
const fieldShape = z.object({
  id: z.uuid(), type: z.enum(invoiceCustomFieldTypes.map(item => item.type)),
  label: z.string().max(255), instructions: z.string().max(2000), defaultValue: valueSchema,
  placeholder: z.string().max(255), autocomplete: z.boolean(), quickSearch: z.boolean(),
  required: z.boolean(), unique: z.boolean(), filterable: z.boolean(), showInList: z.boolean(),
  size: z.enum(["xs", "sm", "md", "lg", "xl"]), newLine: z.boolean(), hidden: z.boolean(),
  options: z.array(z.string().trim().min(1).max(255)).max(100),
  minimum: z.string().max(100).nullable(), maximum: z.string().max(100).nullable(),
  numberRangeMode: z.enum(["digits", "value"]), decimalPlaces: z.number().int().min(1).max(10),
  currency: z.string().regex(/^[A-Z]{3}$/), fileTypes: z.array(z.enum(invoiceCustomFieldFileTypes)).max(7),
  image: z.object({ enabled: z.boolean(), large: z.object({ width: z.number().int().min(0).max(8192), height: z.number().int().min(0).max(8192), crop: z.boolean() }).strict(), thumbnail: z.object({ width: z.number().int().min(0).max(8192), height: z.number().int().min(0).max(8192), crop: z.boolean() }).strict() }).strict(),
  content: z.string().max(20000), placement: z.enum(["view", "edit", "both"]),
}).strict();
export type InvoiceCustomField = z.infer<typeof fieldShape>;

export function invoiceCustomFieldEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const datetimeValid = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value) && dateValid(value.slice(0, 10)) && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value.slice(11));
const numericValid = (value: string) => /^-?\d{1,30}(?:\.\d{1,10})?$/.test(value);

/** Validation shared by the builder and invoice controls; PostgreSQL remains authoritative. */
export function invoiceCustomFieldValueError(field: InvoiceCustomField, value: unknown, enforceRequired = false): string | null {
  if (field.type === "separator" || field.type === "free_static_content") return invoiceCustomFieldEmpty(value) ? null : "هذا العنصر لا يقبل قيمة";
  if (invoiceCustomFieldEmpty(value)) return enforceRequired && field.required ? "هذا الحقل مطلوب" : null;
  if (field.type === "checkbox") return typeof value === "boolean" ? null : "اختر قيمة صحيحة";
  if (field.type === "multiple_dropdown" || field.type === "multiple_checkbox") {
    return Array.isArray(value) && value.length <= 100 && new Set(value).size === value.length && value.every(item => typeof item === "string" && field.options.includes(item)) ? null : "اختر قيمًا من خيارات الحقل";
  }
  if (typeof value !== "string" || value.length > 10000) return "راجع قيمة الحقل وطولها";
  if ((field.type === "dropdown" || field.type === "radio") && !field.options.includes(value)) return "اختر قيمة من خيارات الحقل";
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "أدخل بريدًا إلكترونيًا صحيحًا";
  if (field.type === "website") { try { const u = new URL(value); if (!['https:', 'http:'].includes(u.protocol) || !u.hostname) return "أدخل رابطًا يبدأ بـ https أو http"; } catch { return "أدخل رابطًا صحيحًا"; } }
  if (field.type === "date" && !dateValid(value)) return "أدخل تاريخًا صحيحًا";
  if (field.type === "datetime" && !datetimeValid(value)) return "أدخل تاريخًا ووقتًا صحيحين";
  if (field.type === "time" && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return "أدخل وقتًا صحيحًا";
  if (["number", "decimal", "currency"].includes(field.type)) {
    if (!numericValid(value) || (field.type === "number" && value.includes('.'))) return "أدخل رقمًا صحيحًا";
    if (field.type === "decimal" && (value.split('.')[1]?.length ?? 0) > field.decimalPlaces) return "تجاوزت عدد الخانات العشرية المحدد";
  }
  if (["file_upload", "image_upload"].includes(field.type) && !z.uuid().safeParse(value).success) return "اختر ملفًا مرفوعًا ومؤكدًا";
  const cap = invoiceCustomFieldCapabilities[field.type];
  if (cap.range) {
    const actual = cap.rangeKind === 'length' ? Array.from(value).length : field.type === 'number' && field.numberRangeMode === 'digits' ? value.replace(/^-/, '').length : Number(value);
    for (const [bound, lower] of [[field.minimum, true], [field.maximum, false]] as const) {
      if (bound === null || bound === '') continue;
      const invalid = cap.rangeKind === 'date' || cap.rangeKind === 'datetime' ? lower ? value < bound : value > bound : lower ? actual < Number(bound) : actual > Number(bound);
      if (invalid) return lower ? "القيمة أقل من الحد الأدنى" : "القيمة تتجاوز الحد الأقصى";
    }
  }
  return null;
}

export const invoiceCustomFieldSchema = fieldShape.superRefine((field, ctx) => {
  const cap = invoiceCustomFieldCapabilities[field.type];
  const issue = (path: keyof InvoiceCustomField, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (!['separator', 'free_static_content'].includes(field.type) && !field.label.trim()) issue('label', 'اسم الحقل مطلوب');
  for (const key of ['required', 'unique', 'filterable', 'showInList', 'autocomplete', 'quickSearch'] as const) if (field[key] && !cap[key]) issue(key, 'هذا الخيار غير متاح لنوع الحقل');
  if (field.image.enabled && !cap.compressImage) issue('image', 'ضغط الصور غير متاح لهذا النوع');
  if (field.instructions && !cap.instructions) issue('instructions', 'التعليمات غير متاحة لهذا العنصر');
  if (field.placeholder && !cap.placeholder) issue('placeholder', 'الكلمة البديلة غير متاحة لهذا النوع');
  if (!cap.defaultValue && !invoiceCustomFieldEmpty(field.defaultValue)) issue('defaultValue', 'القيمة المبدئية غير متاحة لهذا النوع');
  if (!cap.options && field.options.length) issue('options', 'الخيارات غير متاحة لهذا النوع');
  if (new Set(field.options).size !== field.options.length) issue('options', 'لا يمكن تكرار خيارات الحقل');
  if (!cap.fileTypes && field.fileTypes.length) issue('fileTypes', 'أنواع الملفات غير متاحة لهذا الحقل');
  if (new Set(field.fileTypes).size !== field.fileTypes.length) issue('fileTypes', 'لا يمكن تكرار أنواع الملفات');
  for (const key of ['minimum', 'maximum'] as const) {
    const value = field[key]; if (value === null) continue;
    if (!cap.range) { issue(key, 'الحدود غير متاحة لهذا الحقل'); continue; }
    if (cap.rangeKind === 'date' ? !dateValid(value) : cap.rangeKind === 'datetime' ? !datetimeValid(value) : !numericValid(value)) issue(key, 'راجع قيمة الحد');
    if ((cap.rangeKind === 'length' || (field.type === 'number' && field.numberRangeMode === 'digits')) && !/^\d{1,5}$/.test(value)) issue(key, 'أدخل عددًا صحيحًا موجبًا للحد');
  }
  if (field.minimum !== null && field.maximum !== null && (cap.rangeKind === 'date' || cap.rangeKind === 'datetime' ? field.minimum > field.maximum : Number(field.minimum) > Number(field.maximum))) issue('maximum', 'الحد الأقصى يجب ألا يقل عن الحد الأدنى');
  if (field.type !== 'free_static_content' && field.content) issue('content', 'المحتوى متاح للكتابة الفاصلة فقط');
  const error = invoiceCustomFieldValueError(field, field.defaultValue); if (error && cap.defaultValue) issue('defaultValue', error);
});
export const invoiceCustomFieldSettingsSchema = z.object({ title: z.string().trim().min(1, 'عنوان النموذج مطلوب').max(255), fields: z.array(invoiceCustomFieldSchema).max(50, 'الحد الأقصى ٥٠ حقلًا') }).strict().superRefine((settings, ctx) => {
  const ids = new Set<string>(); settings.fields.forEach((field, index) => { const id = field.id.toLowerCase(); if (ids.has(id)) ctx.addIssue({ code: 'custom', path: ['fields', index, 'id'], message: 'لا يمكن تكرار معرف الحقل' }); ids.add(id); });
});
export type InvoiceCustomFieldSettings = z.infer<typeof invoiceCustomFieldSettingsSchema>;
export const invoiceCustomFieldStateSchema = z.object({ settings: invoiceCustomFieldSettingsSchema, revision: z.number().int().min(0).max(2_147_483_647) }).strict();
export type InvoiceCustomFieldState = z.infer<typeof invoiceCustomFieldStateSchema>;
const revisionSchema = z.number().int().min(0).max(2_147_483_647);
export const invoiceCustomFieldValuesSchema = z.record(z.uuid(), valueSchema).refine(values => Object.keys(values).length <= 50, 'الحد الأقصى ٥٠ قيمة');
export type InvoiceCustomFieldValues = z.infer<typeof invoiceCustomFieldValuesSchema>;
export const invoiceCustomFieldContextSchema = z.object({
  settings: invoiceCustomFieldSettingsSchema, settingsRevision: revisionSchema,
  savedSettings: invoiceCustomFieldSettingsSchema.nullable(), savedSettingsRevision: revisionSchema.nullable(),
  values: invoiceCustomFieldValuesSchema, revision: revisionSchema, hasSelection: z.boolean(), issued: z.boolean(),
}).strict();
export type InvoiceCustomFieldContext = z.infer<typeof invoiceCustomFieldContextSchema>;
export const invoiceCustomFieldValuesInputSchema = z.object({ draftId: z.uuid(), draftRevision: revisionSchema.min(1), revision: revisionSchema, settingsRevision: revisionSchema, values: invoiceCustomFieldValuesSchema }).strict();
export type InvoiceCustomFieldValuesInput = z.infer<typeof invoiceCustomFieldValuesInputSchema>;
export const invoiceCustomFieldValuesSavedSchema = z.object({ revision: revisionSchema, values: invoiceCustomFieldValuesSchema, issued: z.boolean() }).strict();
export type InvoiceCustomFieldValuesSaved = z.infer<typeof invoiceCustomFieldValuesSavedSchema>;
export const invoiceCustomFieldMediaSchema = z.object({ fileId: z.uuid(), sourceFileId: z.uuid(), thumbnailFileId: z.uuid().nullable(), kind: z.enum(['file', 'image']), mime: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive() }).strict();
const historicalFieldSchema = z.object({ field: invoiceCustomFieldSchema, value: valueSchema, media: invoiceCustomFieldMediaSchema.nullable() }).strict();
export const issuedInvoiceCustomFieldsSchema = z.object({ recorded: z.boolean(), title: z.string(), settingsRevision: revisionSchema, fields: z.array(historicalFieldSchema).max(50) }).strict();
export type IssuedInvoiceCustomFields = z.infer<typeof issuedInvoiceCustomFieldsSchema>;
export const invoiceCustomFieldQueryInputSchema = z.object({ filters: z.array(z.object({ fieldId: z.uuid(), value: valueSchema }).strict()).max(10).default([]), page: z.number().int().min(1).max(100000).default(1), documentIds: z.array(z.uuid()).max(1000).optional() }).strict();
export type InvoiceCustomFieldQueryInput = z.input<typeof invoiceCustomFieldQueryInputSchema>;
export const invoiceCustomFieldQuerySchema = z.object({ columns: z.array(invoiceCustomFieldSchema).max(50), items: z.array(z.object({ documentId: z.uuid(), fields: z.array(historicalFieldSchema).max(50) }).strict()), total: z.number().int().nonnegative(), page: z.number().int().positive(), limit: z.literal(30) }).strict();
export type InvoiceCustomFieldQuery = z.infer<typeof invoiceCustomFieldQuerySchema>;
export function newInvoiceCustomField(type: InvoiceCustomFieldType, id = crypto.randomUUID()): InvoiceCustomField {
  return { id, type, label: invoiceCustomFieldTypes.find(item => item.type === type)!.label, instructions: '', defaultValue: type === 'checkbox' ? false : null,
    placeholder: '', autocomplete: false, quickSearch: false, required: false, unique: false, filterable: false, showInList: false,
    size: 'md', newLine: true, hidden: false, options: [], minimum: null, maximum: null, numberRangeMode: 'digits', decimalPlaces: 1,
    currency: 'SAR', fileTypes: [], image: { enabled: false, large: { width: 0, height: 0, crop: false }, thumbnail: { width: 0, height: 0, crop: false } }, content: '', placement: 'both' };
}

/** Escape all input before restoring a small attribute-free formatting vocabulary. */
export function safeInvoiceCustomFieldContent(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
    .replace(/&lt;(\/?)(p|br|b|strong|i|em|u|s|ul|ol|li|blockquote|h2|h3|h4)(?:\s*\/)?&gt;/gi, '<$1$2>');
}
