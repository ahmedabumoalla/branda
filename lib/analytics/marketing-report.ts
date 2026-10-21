import { z } from "zod";

export const campaignHistoryPageSize = 20;
export const marketingMetricLabels = {
  campaignLaunched: "الحملات المطلقة",
  campaignTargets: "الأرقام المستهدفة بالحملات",
  campaignSent: "رسائل الحملات المرسلة",
  campaignPending: "رسائل الحملات المعلقة",
  campaignFailed: "رسائل الحملات المرفوضة",
  campaignUncertain: "رسائل الحملات غير المؤكدة",
  campaignCancelled: "رسائل الحملات الملغاة",
  campaignSuppressed: "رسائل الحملات الموقوفة",
} as const;
const count = z.number().int().nonnegative();
export const campaignMetricSchema = z.object({
  campaignLaunched: count, campaignTargets: count, campaignSent: count, campaignPending: count,
  campaignFailed: count, campaignUncertain: count, campaignCancelled: count, campaignSuppressed: count,
});
export const emptyCampaignMetrics = {
  campaignLaunched: 0, campaignTargets: 0, campaignSent: 0, campaignPending: 0,
  campaignFailed: 0, campaignUncertain: 0, campaignCancelled: 0, campaignSuppressed: 0,
};
export const marketingCampaignStatusLabels = {
  queued: "بانتظار الإرسال", scheduled: "مجدولة", sending: "جارٍ الإرسال", completed: "اكتملت المعالجة", cancelled: "ملغاة", paused: "متوقفة مؤقتًا",
} as const;
export const campaignHistoryPageSchema = z.object({
  page: count, total: count,
  campaigns: z.array(z.object({
    id: z.uuid(), title: z.string(), body: z.string(), status: z.enum(["queued", "scheduled", "sending", "completed", "cancelled", "paused"]),
    createdAt: z.string(), scheduledAt: z.string(), mediaKind: z.enum(["image", "video"]).nullable(),
    total: count, sent: count, pending: count, failed: count, uncertain: count, cancelled: count, suppressed: count,
  })).max(campaignHistoryPageSize),
});
export type CampaignHistoryPage = z.infer<typeof campaignHistoryPageSchema>;
export const adminCampaignReportSchema = z.object({
  from: z.string().nullable(), to: z.string().nullable(),
  metrics: z.array(campaignMetricSchema.extend({ cafeId: z.uuid() })),
  history: campaignHistoryPageSchema.nullable(),
});
