import { z } from "zod";

const identifier = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const price = z.number().finite().min(0).max(1_000_000);
export const commerceOptionSchema = z.object({
  id: identifier,
  label: z.string().trim().min(1).max(240),
  price,
  available: z.boolean().default(true),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
});
export const commerceOptionGroupSchema = z.object({
  id: identifier,
  label: z.string().trim().min(1).max(240),
  type: z.enum(["select", "multi", "text", "date", "file", "image"]),
  required: z.boolean().default(false),
  hint: z.string().max(1000).optional(),
  showWhen: z.object({ optionIds: z.array(identifier).min(1).max(100) }).optional(),
  accept: z.array(z.enum(["image/png", "image/jpeg", "image/webp"])).min(1).max(3).optional(),
  minChoices: z.number().int().min(0).max(50).optional(),
  maxChoices: z.number().int().min(0).max(50).optional(),
  choices: z.array(z.object({ id: identifier, label: z.string().trim().min(1).max(240), priceDelta: price })).max(50).optional(),
}).superRefine((group, context) => {
  if (["select", "multi"].includes(group.type) && !group.choices?.length) context.addIssue({ code: "custom", path: ["choices"], message: "أضف خيارًا واحدًا على الأقل" });
  if (new Set(group.choices?.map(choice => choice.id)).size !== (group.choices?.length ?? 0)) context.addIssue({ code: "custom", path: ["choices"], message: "معرّفات الخيارات يجب أن تكون مختلفة" });
  if (["select", "multi"].includes(group.type) && ((group.minChoices ?? 0) > (group.maxChoices ?? group.choices?.length ?? 0) || (group.maxChoices ?? 0) > (group.choices?.length ?? 0))) context.addIssue({ code: "custom", path: ["maxChoices"], message: "تحقق من الحد الأدنى والأقصى للاختيارات" });
  if (["select", "multi"].includes(group.type) && group.required && group.maxChoices === 0) context.addIssue({ code: "custom", path: ["maxChoices"], message: "الاختيار المطلوب يجب أن يسمح باختيار واحد على الأقل" });
  if (group.type === "select" && ((group.minChoices ?? 0) > 1 || (group.maxChoices ?? 1) > 1)) context.addIssue({ code: "custom", path: ["maxChoices"], message: "الاختيار الواحد لا يسمح باختيار أكثر من عنصر" });
});
export const commerceDetailsSchema = z.object({
  sourceUrl: z.url().refine(value => /^https?:\/\//.test(value), "رابط المصدر غير صالح").optional(),
  quoteOnly: z.boolean().optional(),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  attributes: z.array(z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(4000) })).max(30).optional(),
  options: z.array(commerceOptionSchema).max(100).optional(),
  optionGroups: z.array(commerceOptionGroupSchema).max(20).optional(),
}).superRefine((details, context) => {
  for (const key of ["options", "optionGroups"] as const) {
    if (new Set(details[key]?.map(item => item.id)).size !== (details[key]?.length ?? 0)) context.addIssue({ code: "custom", path: [key], message: "معرّفات الخيارات يجب أن تكون مختلفة" });
  }
  for (const [index, group] of (details.optionGroups ?? []).entries()) {
    if (group.showWhen?.optionIds.some(id => !details.options?.some(option => option.id === id))) context.addIssue({ code: "custom", path: ["optionGroups", index, "showWhen"], message: "راجع شرط ظهور الحقل بعد تعديل المقاسات والخيارات" });
  }
});

export type CommerceDetails = z.infer<typeof commerceDetailsSchema>;
export type CommerceOption = z.infer<typeof commerceOptionSchema>;
export type CommerceOptionGroup = z.infer<typeof commerceOptionGroupSchema>;

/** Unknown legacy data must not reach interactive controls as unchecked JSON. */
export function readCommerceDetails(value: unknown): CommerceDetails {
  const parsed = commerceDetailsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}
