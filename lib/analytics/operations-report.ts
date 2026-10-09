import { z } from "zod";

export const reportMetricLabels = {
  storefrontVisitors: "زوار الفرع الإلكتروني",
  storefrontVisits: "زيارات الفرع الإلكتروني",
  storefrontAccounts: "حسابات أُنشئت من الفرع",
  accounts: "حسابات العملاء الجديدة",
  unattributedAccounts: "حسابات بمصدر غير محدد",
  menuVisitors: "زوار المنيو المستقل",
  menuVisits: "زيارات المنيو المستقل",
  loyaltyCards: "بطاقات الولاء الصادرة",
  loyaltyCustomers: "عملاء بطاقات الولاء",
  appleCards: "بطاقات آيفون",
  googleCards: "بطاقات أندرويد",
  stampOperations: "عمليات ختم ناجحة",
  rewardOperations: "عمليات صرف مكافأة ناجحة",
} as const;
export type ReportMetric = keyof typeof reportMetricLabels;
export const reportMetrics = Object.keys(reportMetricLabels) as ReportMetric[];
const count = z.number().int().nonnegative();
const date = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value));
export const reportPeriodSchema = z.object({ from: date.default(""), to: date.default("") }).strict()
  .refine(value => !value.from || !value.to || value.from <= value.to, { message: "تاريخ النهاية يجب ألا يسبق البداية" });
export const reportBrandSchema = z.object({
  id: z.uuid(), name: z.string(), slug: z.string(), status: z.string(),
  subscriptionStatus: z.string(), planName: z.string(), expiresAt: z.string().nullable(), subscribed: z.boolean(),
  features: z.array(z.string()),
  lastStorefrontVisit: z.string().nullable(), lastMenuVisit: z.string().nullable(),
  periodLastStorefrontVisit: z.string().nullable(), periodLastMenuVisit: z.string().nullable(),
  metrics: z.object({ storefrontVisitors: count, storefrontVisits: count, storefrontAccounts: count, accounts: count,
    unattributedAccounts: count, menuVisitors: count, menuVisits: count, loyaltyCards: count, loyaltyCustomers: count,
    appleCards: count, googleCards: count, stampOperations: count, rewardOperations: count }),
});
export const operationsReportSchema = z.object({
  generatedAt: z.string(), from: z.string().nullable(), to: z.string().nullable(),
  menuTrackingSince: z.string(), walletTrackingSince: z.string(), registrationTrackingSince: z.string(),
  brands: z.array(reportBrandSchema),
});
export type OperationsReport = z.infer<typeof operationsReportSchema>;
export type ReportBrand = z.infer<typeof reportBrandSchema>;
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type MetricCondition = { metric: ReportMetric; operator: "gte" | "lte" | "eq"; value: number };
export type ReportFilters = { query: string; brandId: string; subscription: "all" | "subscribed" | "unsubscribed"; feature: string; conditions: MetricCondition[]; sort: ReportMetric | "name" | "lastMenuVisit" | "lastStorefrontVisit"; direction: "asc" | "desc" };
export const defaultReportFilters: ReportFilters = { query: "", brandId: "", subscription: "all", feature: "", conditions: [], sort: "name", direction: "asc" };
const normalize = (value: string) => value.toLocaleLowerCase("ar").normalize("NFKC").replace(/[\u064b-\u065f\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
export function filterReportBrands(brands: ReportBrand[], filters: ReportFilters) {
  const terms = normalize(filters.query.trim()).split(/\s+/).filter(Boolean);
  return brands.filter(brand => (!filters.brandId || brand.id === filters.brandId)
    && terms.every(term => normalize(`${brand.name} ${brand.slug} ${brand.planName}`).includes(term))
    && (filters.subscription === "all" || brand.subscribed === (filters.subscription === "subscribed"))
    && (!filters.feature || brand.features.includes(filters.feature))
    && filters.conditions.every(condition => Number.isFinite(condition.value) && condition.value >= 0 &&
      (condition.operator === "gte" ? brand.metrics[condition.metric] >= condition.value : condition.operator === "lte" ? brand.metrics[condition.metric] <= condition.value : brand.metrics[condition.metric] === condition.value)))
    .sort((a, b) => {
      const key = filters.sort;
      const comparison = key === "name" ? a.name.localeCompare(b.name, "ar")
        : key === "lastMenuVisit" || key === "lastStorefrontVisit" ? (a[key] || "").localeCompare(b[key] || "")
          : a.metrics[key] - b.metrics[key];
      return (filters.direction === "asc" ? comparison : -comparison) || a.id.localeCompare(b.id);
    });
}
export function totalReportMetrics(brands: ReportBrand[]) {
  return Object.fromEntries(reportMetrics.map(key => [key, brands.reduce((sum, brand) => sum + brand.metrics[key], 0)])) as Record<ReportMetric, number>;
}
export function saudiDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "لا توجد زيارة مسجلة";
}
