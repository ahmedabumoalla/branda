import { z } from "zod";
import type { CafeOffer } from "@/lib/mock/offers";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "أدخل تاريخًا صحيحًا");

export const rastRulesSchema = z.object({
  rastKind: z.enum(["products", "general", "event"]),
  selectedProductIds: z.array(z.string().uuid()).max(24).default([]),
  appliesToAllProducts: z.boolean().default(false),
  eventDate: date.optional(),
  eventTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  eventLocation: z.string().trim().max(160).optional(),
});

export const rastCampaignSchema = z.object({
  title: z.string().trim().min(1, "اكتب عنوان البطاقة").max(100),
  description: z.string().trim().min(1, "اكتب وصفًا للبطاقة").max(700),
  discountPercent: z.number().min(0).max(100).nullable().optional(),
  code: z.string().trim().max(40).nullable().optional(),
  startDate: date.nullable().optional(),
  endDate: date.nullable().optional(),
  status: z.enum(["نشط", "مجدول", "مسودة", "متوقف", "منتهي", "active", "scheduled", "draft", "inactive", "expired"]),
  offerRules: rastRulesSchema,
}).superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (value.startDate && value.endDate && value.endDate < value.startDate) issue("تاريخ النهاية يجب ألا يسبق البداية");
  if (value.status === "مجدول" && !value.startDate) issue("حدد تاريخ بداية العرض المجدول");
  if (value.offerRules.rastKind !== "event" && !(Number(value.discountPercent) > 0)) issue("أدخل نسبة خصم أكبر من صفر وحتى ١٠٠٪");
  if (value.offerRules.rastKind === "products" && !value.offerRules.selectedProductIds.length) issue("اختر منتجًا واحدًا على الأقل");
  if (value.offerRules.rastKind === "event") {
    if (!value.offerRules.eventDate || !value.offerRules.eventTime || !value.offerRules.eventLocation) issue("حدد تاريخ الفعالية ووقتها ومكانها");
    if (value.offerRules.eventDate && value.startDate && value.offerRules.eventDate < value.startDate) issue("يجب أن يبدأ الإعلان قبل الفعالية أو في يومها");
  }
});

export function rastOfferKind(offer: Pick<CafeOffer, "type" | "targetType" | "linkedProductId" | "offerRules">) {
  return offer.offerRules?.rastKind ?? (offer.targetType === "experience_campaign" ? "event" : offer.offerRules?.appliesToAllProducts || (offer.type === "خصم" && !offer.linkedProductId && !offer.offerRules?.selectedProductIds?.length) ? "general" : "products");
}
