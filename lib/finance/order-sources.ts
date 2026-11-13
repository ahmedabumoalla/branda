import { z } from "zod";

const revision = z.number().int().min(0).max(2_147_483_647);
export const orderSourceSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1, "اسم مصدر الطلب مطلوب").max(80), active: z.boolean() }).strict();
export const orderSourceSettingsSchema = z.object({
  sources: z.array(orderSourceSchema).max(100), defaultMode: z.enum(["none", "last", "specific"]),
  defaultSourceId: z.uuid().nullable(), required: z.boolean(),
}).strict().superRefine((settings, ctx) => {
  const ids = new Set<string>(), names = new Set<string>();
  settings.sources.forEach((source, index) => {
    const name = source.name.toLocaleLowerCase(), id = source.id.toLowerCase();
    if (ids.has(id) || names.has(name)) ctx.addIssue({ code: "custom", path: ["sources", index, "name"], message: "لا يمكن تكرار اسم مصدر الطلب أو معرفه" });
    ids.add(id); names.add(name);
  });
  if (settings.defaultMode === "specific" && !settings.sources.some(source => source.id === settings.defaultSourceId && source.active)) ctx.addIssue({ code: "custom", path: ["defaultSourceId"], message: "اختر مصدر طلب نشطًا ليكون الافتراضي" });
  if (settings.defaultMode !== "specific" && settings.defaultSourceId !== null) ctx.addIssue({ code: "custom", path: ["defaultSourceId"], message: "راجع مصدر الطلب الافتراضي" });
  if (settings.required && !settings.sources.some(source => source.active)) ctx.addIssue({ code: "custom", path: ["required"], message: "أضف مصدر طلب نشطًا قبل جعله مطلوبًا" });
});
export const orderSourceStateSchema = z.object({ settings: orderSourceSettingsSchema, revision }).strict();
export const orderSourceContextSchema = z.object({
  settings: orderSourceSettingsSchema, settingsRevision: revision, selectedSourceId: z.uuid().nullable(),
  selectionRevision: revision, hasSelection: z.boolean(), defaultSelectionId: z.uuid().nullable(), issued: z.boolean(),
}).strict();
export const invoiceOrderSourceInputSchema = z.object({ draftId: z.uuid(), draftRevision: revision.min(1), sourceId: z.uuid().nullable(), revision }).strict();
export const invoiceOrderSourceSavedSchema = z.object({ sourceId: z.uuid().nullable(), revision, issued: z.boolean() }).strict();
export const issuedOrderSourceSchema = z.object({ sourceId: z.uuid().nullable(), name: z.string().min(1).max(80).nullable(), recorded: z.boolean() }).strict();
export type OrderSourceSettings = z.infer<typeof orderSourceSettingsSchema>;
export type OrderSourceState = z.infer<typeof orderSourceStateSchema>;
export type OrderSourceContext = z.infer<typeof orderSourceContextSchema>;
export type InvoiceOrderSourceInput = z.infer<typeof invoiceOrderSourceInputSchema>;
