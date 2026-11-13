import { z } from "zod";
export const erpFieldTypes = ["text", "textarea", "url", "email", "phone", "date", "time", "currency", "number", "checkbox", "location", "file", "image", "subform", "separator", "select", "multiselect", "dynamic", "multidynamic", "static", "formatted"] as const;
export type ErpFieldType = typeof erpFieldTypes[number];
export const erpFieldLabels: Record<ErpFieldType, string> = { text: "سطر واحد", textarea: "أسطر متعددة", url: "رابط", email: "بريد إلكتروني", phone: "رقم الهاتف", date: "تاريخ", time: "وقت", currency: "عملة", number: "رقم", checkbox: "مفتاح تبديل", location: "موقع على الخريطة", file: "ملف", image: "صورة", subform: "نماذج فرعية متعددة", separator: "فاصل", select: "قائمة اختيار", multiselect: "اختيار متعدد", dynamic: "قائمة مرتبطة", multidynamic: "قائمة مرتبطة متعددة", static: "محتوى ثابت", formatted: "نص منسق" };
export type ErpFieldValue = string | number | boolean | null | string[] | { latitude: number; longitude: number } | ErpFieldValues[];
export type ErpFieldValues = { [key: string]: ErpFieldValue };
export type ErpFieldChoice = { id: string; name: string; code?: string; email?: string; phone?: string };
export type ErpFieldSources = Record<string, { label: string; options: ErpFieldChoice[] }>;
export type ErpCustomField = {
  id: string; label: string; type: ErpFieldType; required: boolean; options: string[];
  placeholder?: string; defaultValue?: ErpFieldValue; minimum?: number | null; maximum?: number | null;
  unique?: boolean; filterable?: boolean; showInList?: boolean; searchable?: boolean; beside?: boolean; size?: "small" | "medium" | "large";
  entity?: string; listingField?: "name" | "code" | "email" | "phone"; content?: string; placement?: "both" | "view" | "form";
  minimumRows?: number; sortable?: boolean; fields?: ErpCustomField[];
};
const schemaAt = (depth: number): z.ZodType<ErpCustomField> => z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), label: z.string().trim().min(1).max(150), type: z.enum(erpFieldTypes), required: z.boolean(), options: z.array(z.string().trim().min(1).max(200)).max(200),
  placeholder: z.string().max(250).optional(), defaultValue: z.unknown().optional(), minimum: z.number().finite().nullable().optional(), maximum: z.number().finite().nullable().optional(),
  unique: z.boolean().optional(), filterable: z.boolean().optional(), showInList: z.boolean().optional(), searchable: z.boolean().optional(), beside: z.boolean().optional(), size: z.enum(["small", "medium", "large"]).optional(),
  entity: z.string().regex(/^[a-z][a-z0-9_-]{0,60}$/).optional(), listingField: z.enum(["name", "code", "email", "phone"]).optional(), content: z.string().max(20000).optional(), placement: z.enum(["both", "view", "form"]).optional(), minimumRows: z.number().int().min(0).max(100).optional(), sortable: z.boolean().optional(), fields: depth < 2 ? z.array(z.lazy(() => schemaAt(depth + 1))).max(30).optional() : z.array(z.never()).max(0).optional(),
}).superRefine((f, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (f.type === "subform" && (!f.fields?.length || depth === 2)) issue("أضف حقول النموذج الفرعي ضمن مستويين");
  if (["select", "multiselect"].includes(f.type) && !f.options.length) issue("أدخل خيارات القائمة");
  if (["dynamic", "multidynamic"].includes(f.type) && !f.entity) issue("اختر الكيان المرتبط");
  if (f.minimum !== null && f.maximum !== null && f.minimum !== undefined && f.maximum !== undefined && f.minimum > f.maximum) issue("الحد الأدنى يتجاوز الأعلى");
  if (new Set(f.options).size !== f.options.length || f.fields && new Set(f.fields.map(x => x.id)).size !== f.fields.length) issue("الخيارات أو معرفات الحقول مكررة");
}) as z.ZodType<ErpCustomField>;
export const erpCustomFieldSchema = schemaAt(0);
export const erpCustomFieldsSchema = z.array(erpCustomFieldSchema).max(50).refine(fields => new Set(fields.map(f => f.id)).size === fields.length, "معرفات الحقول مكررة");
/** Only attribute-free formatting is emitted; scripts, event attributes and URLs stay escaped. */
export function safeErpRichText(value: string): string {
  const decoded = value.replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => ({amp:"&",lt:"<",gt:">",quot:'"',"#39":"'"}[entity] || ""));
  return decoded.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;").replace(/&lt;(\/?)(p|br|b|strong|i|em|u|s|ul|ol|li|blockquote|h2|h3|h4)(?:\s*\/)?&gt;/gi,"<$1$2>");
}
export function newErpField(type: ErpFieldType): ErpCustomField { return { id: `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`, label: erpFieldLabels[type], type, required: false, options: [], placeholder: "", unique: false, filterable: false, showInList: false, beside: false, size: "medium", searchable: false, minimum: null, maximum: null, minimumRows: 0, sortable: false, fields: [], content: "", placement: "both", listingField: "name" }; }
export function erpFieldDefault(field: ErpCustomField): ErpFieldValue {
  if (field.defaultValue !== undefined) return field.defaultValue;
  if (field.type === "checkbox") return false;
  if (field.type === "subform") return Array.from({ length: field.minimumRows || 0 }, () => Object.fromEntries((field.fields || []).map(f => [f.id, erpFieldDefault(f)])));
  if (["multiselect", "multidynamic"].includes(field.type)) return [];
  return "";
}
export function validateErpFieldValues(fields: ErpCustomField[], values: Record<string, unknown>, sources: ErpFieldSources = {}): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (["static", "separator"].includes(field.type)) continue;
    const v = values[field.id] ?? erpFieldDefault(field), empty = v === null || v === "" || Array.isArray(v) && !v.length;
    const add = (message: string) => errors.push(`${field.label}: ${message}`);
    if (empty) { if (field.required) add("هذا الحقل مطلوب");continue; }
    if (field.type === "subform") { if (!Array.isArray(v) || v.length > 100 || v.length < (field.minimumRows || 0)) add("عدد صفوف النموذج غير صالح");else for (const row of v) { if (!row || typeof row !== "object" || Array.isArray(row)) add("بيانات الصف غير صالحة");else errors.push(...validateErpFieldValues(field.fields || [], row, sources)); }continue; }
    if (field.type === "checkbox") { if (typeof v !== "boolean" || field.required && !v) add("اختر قيمة صحيحة");continue; }
    if (field.type === "location") { const point = v as { latitude?: number; longitude?: number };if (!point || typeof point !== "object" || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude!) > 90 || Math.abs(point.longitude!) > 180) add("إحداثيات الموقع غير صالحة");continue; }
    if (["select", "multiselect", "dynamic", "multidynamic"].includes(field.type)) { const allowed = field.type.includes("dynamic") ? sources[field.entity || ""]?.options.map(x => x.id) || [] : field.options;const choices = ["multiselect", "multidynamic"].includes(field.type) ? v : [v];if (!Array.isArray(choices) || choices.some(x => typeof x !== "string" || !allowed.includes(x))) add("اختر من القيم المتاحة");continue; }
    if (["number", "currency"].includes(field.type)) { const n = Number(v);if (!Number.isFinite(n) || field.minimum !== null && field.minimum !== undefined && n < field.minimum || field.maximum !== null && field.maximum !== undefined && n > field.maximum) add("الرقم خارج المدى");continue; }
    if (typeof v !== "string" || v.length > 20000) { add("القيمة غير صالحة");continue; }
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) add("أدخل بريدًا صحيحًا");
    if (field.type === "url") { try { if (!["http:", "https:"].includes(new URL(v).protocol)) add("أدخل رابطًا آمنًا"); } catch { add("أدخل رابطًا صحيحًا"); } }
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) add("أدخل وقتًا صحيحًا");
    if (field.type === "date" && !z.iso.date().safeParse(v).success) add("أدخل تاريخًا صحيحًا");
    if (["file", "image"].includes(field.type) && !z.uuid().safeParse(v).success) add("اختر مرفقًا محفوظًا");
    if (["text", "textarea", "formatted"].includes(field.type) && (field.minimum !== null && field.minimum !== undefined && v.length < field.minimum || field.maximum !== null && field.maximum !== undefined && v.length > field.maximum)) add("طول النص خارج المدى");
  }
  return errors;
}
