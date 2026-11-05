import { z } from "zod";
import { analyticsCouponConfigSchema } from "@/lib/analytics/analytics-coupons";

const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
export const brandAnalyticsCampaignSegmentSchema = z.enum(["inactive", "loyal", "absent"]);
const audienceFields = {
  brandId: z.uuid(), segment: brandAnalyticsCampaignSegmentSchema,
  inactiveDays: z.number().int().min(1).max(365).default(10),
};
export const brandAnalyticsCampaignAudienceInputSchema = z.object({
  ...audienceFields, page: z.number().int().min(1).max(100000).default(1),
}).strict().transform(input => ({ ...input, inactiveDays: input.segment === "absent" ? input.inactiveDays : 10 }));
export const brandAnalyticsCampaignInputSchema = z.object({
  ...audienceFields, audienceDigest: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.uuid(),
  title: z.string().trim().min(1).max(100), body: z.string().trim().min(1).max(3000),
  contentKind: z.enum(["message", "offer", "coupon"]), scheduledAt: timestamp.optional(),
  coupon: analyticsCouponConfigSchema.optional(),
}).strict().superRefine((input, context) => {
  if ((input.contentKind === "coupon") !== Boolean(input.coupon)) {
    context.addIssue({ code: "custom", path: ["coupon"], message: "Coupon settings must match the content kind" });
  }
  if (input.contentKind === "coupon" && input.body.length > 2000) {
    context.addIssue({ code: "custom", path: ["body"], message: "Coupon message body exceeds the limit" });
  }
}).transform(input => ({ ...input, inactiveDays: input.segment === "absent" ? input.inactiveDays : 10 }));
export const brandAnalyticsCampaignAudienceSchema = z.object({
  generatedAt: timestamp, brandId: z.uuid(), segment: brandAnalyticsCampaignSegmentSchema,
  inactiveDays: z.number().int().min(1).max(365), matched: count, total: count, excluded: count,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(z.object({ id: z.uuid(), name: z.string(), phone: z.string().regex(/^9665\d{8}$/),
    lastVisitAt: timestamp.nullable(), inactiveDays: z.number().nonnegative(), visitDays: count,
    averageVisitGapDays: z.number().nonnegative().nullable() })).max(25),
  page: z.number().int().positive(), pageSize: z.literal(25),
}).refine(value => value.total <= value.matched && value.excluded === value.matched - value.total);
export const brandAnalyticsCampaignCreatedSchema = z.object({ campaignId: z.uuid(), total: z.number().int().min(1).max(10000) });
export type BrandAnalyticsCampaignAudienceInput = z.input<typeof brandAnalyticsCampaignAudienceInputSchema>;
export type BrandAnalyticsCampaignInput = z.input<typeof brandAnalyticsCampaignInputSchema>;
export type BrandAnalyticsCampaignAudience = z.infer<typeof brandAnalyticsCampaignAudienceSchema> & {
  sender: { ready: boolean; phone: string | null; status: string };
};
export type BrandAnalyticsCampaignCreated = z.infer<typeof brandAnalyticsCampaignCreatedSchema>;
export type BrandAnalyticsCampaignErrorCode = "audience_changed" | "sender_unavailable" | "invalid" | "uncertain" | "unauthorized" | "unavailable";
export type BrandAnalyticsCampaignResult<T> = { ok: true; data: T } | { ok: false; message: string; code: BrandAnalyticsCampaignErrorCode };
