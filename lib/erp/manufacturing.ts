import { z } from "zod";
import {manufacturingNoteFields,validateManufacturingNote,normalizeManufacturingNote} from "./manufacturing-notes";
import { erpCustomFieldSchema, erpCustomFieldsSchema, type ErpCustomField, type ErpFieldSources } from "./custom-fields";

const id = z.uuid();
const optionalId = z.union([id, z.literal("")]).default("");
const amount = z.number().finite().min(0).max(999_999_999).multipleOf(0.000001);
const quantity = z.number().finite().positive().max(999_999_999).multipleOf(0.001);
const label = z.string().trim().min(1, "أدخل الاسم").max(150);
const day = z.union([z.iso.date(), z.literal("")]).default("");
const material = z.object({ itemId: id, quantity, price: amount.default(0), stage: z.string().max(100).default("") });
const expense = z.object({ name: label, accountId: id, amount, stage: z.string().max(100).default("") });
const operation = z.object({ workstationId: id, quantity, stage: z.string().max(100).default("") });
const customValues = z.record(z.string().max(100), z.unknown()).refine(v => JSON.stringify(v).length <= 262144, "بيانات الحقول الإضافية كبيرة").default({});
const common = { name: label, code: z.string().trim().min(1, "أدخل الكود").max(60), description: z.string().max(4000).default("") };
const costs = { materials: z.array(material).max(200).default([]), expenses: z.array(expense).max(100).default([]), operations: z.array(operation).max(100).default([]), scrap: z.array(material).max(100).default([]) };
const production = { ...common, productId: id, quantity, accountId: id, routingId: optionalId, ...costs };
const dateRange = <T extends { from: string; to: string }>(v: T) => !v.from || !v.to || v.to >= v.from;

export const manufacturingKinds = ["bom", "plans", "orders", "overheads", "workstations", "routings"] as const;
export type ManufacturingKind = typeof manufacturingKinds[number];
export const manufacturingLabels: Record<ManufacturingKind, string> = { bom: "قوائم مواد الإنتاج", plans: "خطط الإنتاج", orders: "أوامر التصنيع", overheads: "التكاليف غير المباشرة", workstations: "محطات العمل", routings: "مسارات الإنتاج" };
export const manufacturingStates: Record<string, string> = { draft: "مسودة", ready: "جاهز", in_progress: "قيد التنفيذ", completed: "مغلق", cancelled: "ملغى", active: "نشط", inactive: "غير نشط" };
export const manufacturingPayloads = {
  bom: z.object({ ...production, active: z.boolean().default(true), isDefault: z.boolean().default(false) }),
  plans: z.object({ ...common, from: day, to: day, customerId: optionalId, employees: z.array(id).max(100).default([]), sourceId: optionalId, items: z.array(z.object({ productId: id, quantity, bomId: id })).min(1, "أضف منتجًا واحدًا على الأقل").max(100), customValues }).refine(dateRange, "تاريخ النهاية يسبق البداية"),
  orders: z.object({ ...production, from: day, to: day, bomId: optionalId, customerId: optionalId, employees: z.array(id).max(100).default([]), customValues }).refine(dateRange, "تاريخ النهاية يسبق البداية"),
  workstations: z.object({ ...common, unit: z.string().trim().min(1).max(30).default("ساعة"), expenses: z.array(expense).max(100).default([]), wagesCost: amount.default(0), wagesAccountId: optionalId, assetsCost: amount.default(0), assetsAccountId: optionalId, assetId: optionalId, autoDepreciate:z.boolean().default(false), active: z.boolean().default(true) }).refine(v => (!v.wagesCost || !!v.wagesAccountId) && (!v.assetsCost || !!v.assetsAccountId), "اختر حساب الأجور والأصل للتكلفة المدخلة"),
  routings: z.object({ ...common, stages: z.array(label).min(1, "أضف مرحلة إنتاجية").max(100) }).refine(v => new Set(v.stages).size === v.stages.length, "أسماء المراحل مكررة"),
  overheads: z.object({ ...common, from: day, to: day, accountId: id, method: z.enum(["quantity", "value"]), sources: z.array(z.object({ documentId: id, amount: amount.refine(v => v > 0) })).min(1).max(100), orderIds: z.array(id).min(1).max(100) }).refine(dateRange, "تاريخ النهاية يسبق البداية"),
};
export type ManufacturingPayload = { [K in ManufacturingKind]: z.infer<typeof manufacturingPayloads[K]> }[ManufacturingKind];
export type ManufacturingMaterial = z.infer<typeof material>;
export type ManufacturingExpense = z.infer<typeof expense>;
export type ManufacturingOperation = z.infer<typeof operation>;
export type ManufacturingRecord = {
  id: string; kind: ManufacturingKind; name: string; code: string; status: string; revision: number; payload: Record<string, unknown>;
  created_at: string; updated_at: string; material_cost?: number; additional_cost?: number; output_quantity?: number; plan_id?: string | null;
};
export type ManufacturingEvent = { id: string; record_id: string; kind: string; action: string; note: string; created_at: string; actor_name: string; payload: Record<string, unknown>; document_id: string | null };
export type ManufacturingLookup = { trackingMode?: import("./inventory-tracking").TrackingMode; id: string; name: string; code?: string; quantity?: number; price?: number; status?: string; payload?: Record<string, unknown>; total?: number };
export type ManufacturingField = ErpCustomField;
export type ManufacturingSettings = { autoStartOrders: boolean; allowPartialMaterials: boolean; orderStatuses: string[]; planStatuses: string[]; orderFields: ManufacturingField[]; planFields: ManufacturingField[]; orderForms: { id: string; name: string; fields: ManufacturingField[] }[]; planForms: { id: string; name: string; fields: ManufacturingField[] }[] };
export const manufacturingFieldSchema = erpCustomFieldSchema;
const fieldsSchema = erpCustomFieldsSchema;
const relatedForm = z.object({ id: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), name: label, fields: fieldsSchema });
export const manufacturingSettingsSchema = z.object({ autoStartOrders: z.boolean(), allowPartialMaterials: z.boolean(), orderStatuses: z.array(label).max(100), planStatuses: z.array(label).max(100), orderFields: fieldsSchema, planFields: fieldsSchema, orderForms: z.array(relatedForm).max(30), planForms: z.array(relatedForm).max(30) });
export const defaultManufacturingSettings: ManufacturingSettings = { autoStartOrders: true, allowPartialMaterials: true, orderStatuses: [], planStatuses: [], orderFields: [], planFields: [], orderForms: [], planForms: [] };
export type ManufacturingSnapshot = { forms: import("./manufacturing-forms").ManufacturingFormsSnapshot; slug: string; cafeName?: string; issues: {id:string;item_id:string;warehouse_id:string;quantity:number;returned:number;cost:number;returned_cost:number;document_id:string}[]; allocations: {id:string;order_id:string;order_name:string;order_code:string;amount:number;document_id:string;source_document_id:string}[]; records: ManufacturingRecord[]; total: number; events: ManufacturingEvent[]; relatedOrders: ManufacturingRecord[]; settings: ManufacturingSettings; settingsRevision: number; role: string; canWrite: boolean; canConfigure: boolean; lookups: { items: ManufacturingLookup[]; warehouses: ManufacturingLookup[]; accounts: ManufacturingLookup[]; customers: ManufacturingLookup[]; employees: ManufacturingLookup[]; bom: ManufacturingLookup[]; routings: ManufacturingLookup[]; workstations: ManufacturingLookup[]; orders: ManufacturingLookup[]; sources: ManufacturingLookup[]; assets: ManufacturingLookup[] }; };
export const manufacturingQuerySchema = z.object({ kind: z.enum(manufacturingKinds), id: optionalId, query: z.string().max(150).default(""), status: z.string().max(100).default(""), page: z.number().int().min(1).max(100000).default(1), filters: z.record(z.string().max(60),z.string().max(200)).default({}) });
export type ManufacturingQuery = z.infer<typeof manufacturingQuerySchema>;
export const manufacturingActionSchema = z.object({ ...manufacturingNoteFields, kind: z.enum(manufacturingKinds), id, revision: z.number().int().min(1), requestId: id, action: z.enum(["start", "cancel", "reopen", "delete", "copy", "generate", "receive", "return", "finish", "note", "followup", "related-form", "custom-fields"]), warehouseId: optionalId, deliveryDate: day, quantity: amount.optional(), lines: z.array(z.object({ itemId: id, quantity })).max(200).default([]), note: z.string().max(10000).default(""), value: z.record(z.string(), z.unknown()).default({}) }).superRefine(validateManufacturingNote).transform(normalizeManufacturingNote);
export type ManufacturingAction = z.infer<typeof manufacturingActionSchema>;

export function manufacturingEstimate(payload: Record<string, unknown>, stations: ManufacturingLookup[] = []) {
  const sum = (rows: unknown, fn: (row: Record<string, unknown>) => number) => Array.isArray(rows) ? rows.reduce((n, row) => n + fn(row), 0) : 0;
  const materials = sum(payload.materials, x => Number(x.quantity || 0) * Number(x.price || 0));
  const expenses = sum(payload.expenses, x => Number(x.amount || 0));
  const operations = sum(payload.operations, x => { const station = stations.find(s => s.id === x.workstationId)?.payload; return Number(x.quantity || 0) * (Number(station?.wagesCost || 0) + Number(station?.assetsCost || 0) + sum(station?.expenses, r => Number(r.amount || 0))); });
  const scrap = sum(payload.scrap, x => Number(x.quantity || 0) * Number(x.price || 0));
  return { materials, expenses, operations, scrap, total: materials + expenses + operations - scrap };
}

export function blankManufacturingPayload(kind: ManufacturingKind): Record<string, unknown> {
  const base = { name: "", code: "", description: "", productId: "", quantity: 1, accountId: "", routingId: "", from: "", to: "", customerId: "", employees: [], customValues: {}, materials: [], expenses: [], operations: [], scrap: [] };
  if (kind === "bom") return { ...base, active: true, isDefault: false };
  if (kind === "plans") return { ...base, sourceId: "", items: [{ productId: "", quantity: 1, bomId: "" }] };
  if (kind === "orders") return { ...base, bomId: "" };
  if (kind === "workstations") return { ...base, unit: "ساعة", wagesCost: 0, wagesAccountId: "", assetsCost: 0, assetsAccountId: "", assetId:"", autoDepreciate:false, active: true };
  if (kind === "routings") return { ...base, stages: [""] };
  return { ...base, method: "quantity", sources: [], orderIds: [] };
}
export function manufacturingFieldSources(snapshot: ManufacturingSnapshot): ErpFieldSources {
  const labels: Record<keyof ManufacturingSnapshot["lookups"], string> = { items: "الأصناف", customers: "العملاء", employees: "الموظفون", warehouses: "المستودعات", accounts: "الحسابات", bom: "قوائم مواد الإنتاج", routings: "مسارات الإنتاج", workstations: "محطات العمل", orders: "أوامر التصنيع", sources: "المستندات", assets:"الأصول" };
  return Object.fromEntries(Object.entries(snapshot.lookups).map(([id, options]) => [id, { label: labels[id as keyof typeof labels], options }]));
}
