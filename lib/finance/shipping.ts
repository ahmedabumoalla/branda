import { z } from "zod";

const revision = z.number().int().min(0).max(2_147_483_647);
export const shippingSettingsSchema = z.object({ enabled: z.boolean(), codServiceId: z.uuid().nullable() }).strict();
export const shippingOptionInputSchema = z.object({
  name: z.string().trim().min(1, "اسم خيار الشحن مطلوب").max(160, "الحد الأقصى للاسم ١٦٠ حرفًا"), active: z.boolean(),
  fee: z.number({ error: "أدخل رسوم شحن صالحة" }).finite().min(0, "رسوم الشحن لا تقبل قيمة سالبة").max(10_000_000, "رسوم الشحن تتجاوز الحد المسموح").refine(value => Math.abs(value * 100 - Math.round(value * 100)) < .000001, "رسوم الشحن تقبل منزلتين عشريتين"),
  taxRate: z.literal(15).nullable(), displayOrder: z.number({ error: "أدخل ترتيب عرض صالحًا" }).int("ترتيب العرض يقبل عددًا صحيحًا").min(0, "ترتيب العرض لا يقبل قيمة سالبة").max(999999, "ترتيب العرض يتجاوز الحد المسموح"),
  accountId: z.uuid().nullable(), description: z.string().max(1000, "الحد الأقصى للوصف ١٠٠٠ حرف"),
}).strict();
export const shippingOptionSchema = shippingOptionInputSchema.extend({ id: z.uuid(), revision: revision.min(1), createdAt: z.string(), updatedAt: z.string() }).strict();
export const shippingContextSchema = z.object({
  settings: shippingSettingsSchema, revision,
  services: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()).max(500),
  accounts: z.array(z.object({ id: z.uuid(), name: z.string(), code: z.string() }).strict()).max(500),
  optionNames: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()).max(500),
}).strict();
export const shippingListQuerySchema = z.object({ query: z.string().trim().max(160), status: z.enum(["all", "active", "inactive"]), page: z.number().int().min(1).max(1000), sort: z.enum(["displayOrder", "name", "fee", "active"]), direction: z.enum(["asc", "desc"]) }).strict();
export const shippingListSchema = z.object({ items: z.array(shippingOptionSchema).max(30), total: z.number().int().min(0).max(500), page: z.number().int().positive(), limit: z.literal(30) }).strict();
const activityValue = z.union([z.string().max(1000), z.number(), z.boolean(), z.null()]);
export const shippingActivityQuerySchema = z.object({ actions: z.array(z.enum(["created", "updated", "deleted"])).max(3), actorIds: z.array(z.uuid()).max(50), from: z.union([z.iso.date(), z.literal("")]), to: z.union([z.iso.date(), z.literal("")]), direction: z.enum(["asc", "desc"]), page: z.number().int().min(1).max(1000) }).strict().refine(value => !value.from || !value.to || value.from <= value.to, "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية");
export const shippingActivitySchema = z.object({ items: z.array(z.object({ id: z.uuid(), revision: revision.min(1), action: z.enum(["created", "updated", "deleted"]), actorId: z.uuid(), actor: z.string(), createdAt: z.string(), changes: z.array(z.object({ field: z.enum(["name", "active", "fee", "taxRate", "displayOrder", "accountId", "description"]), before: activityValue, after: activityValue }).strict()).max(7) }).strict()).max(20), page: z.number().int().positive(), total: z.number().int().nonnegative(), limit: z.literal(20), actors: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()).max(500) }).strict();
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;
export type ShippingOptionInput = z.infer<typeof shippingOptionInputSchema>;
export type ShippingOption = z.infer<typeof shippingOptionSchema>;
export type ShippingContext = z.infer<typeof shippingContextSchema>;
export type ShippingListQuery = z.infer<typeof shippingListQuerySchema>;
export type ShippingActivity = z.infer<typeof shippingActivitySchema>;
export type ShippingActivityQuery = z.infer<typeof shippingActivityQuerySchema>;
export const defaultShippingQuery: ShippingListQuery = { query: "", status: "all", page: 1, sort: "displayOrder", direction: "asc" };
export const defaultShippingActivityQuery: ShippingActivityQuery = { actions: [], actorIds: [], from: "", to: "", direction: "desc", page: 1 };
