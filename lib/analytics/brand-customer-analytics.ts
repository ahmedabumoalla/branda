import { z } from "zod";

const count = z.number().int().nonnegative();
const timestamp = z.string().datetime({ offset: true });
const optionalTimestamp = timestamp.nullable();
export const brandAnalyticsDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]);
export const brandAnalyticsRetentionSchema = z.object({
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]), eligible: count, retained: count,
  rate: z.number().min(0).max(100).nullable(),
});
export const brandAnalyticsBrandSchema = z.object({
  id: z.uuid(), name: z.string(), slug: z.string(), category: z.string(),
  registeredCustomers: count, cardholders: count, activeCustomers: count, inactiveCustomers: count,
  returningCustomers: count, loyalCustomers: count, walletCustomers: count, visitsInPeriod: count,
  averageVisitGapDays: z.number().nonnegative().nullable(),
  retention: z.array(brandAnalyticsRetentionSchema).length(3), lastVisitAt: optionalTimestamp,
});
export const brandAnalyticsCustomerSchema = z.object({
  id: z.uuid(), name: z.string(), phone: z.string(), email: z.string(), status: z.string(),
  identityMatch: z.enum(["phone", "account", "profile"]), joinedAt: timestamp, cardIssuedAt: optionalTimestamp,
  cardCount: count, currentStamps: count, totalStamps: count, rewardsRedeemed: count,
  lastStampAt: optionalTimestamp, lastRedemptionAt: optionalTimestamp, lastVisitAt: optionalTimestamp,
  inactiveDays: z.number().nonnegative(), isInactive: z.boolean(), visitDays: count,
  averageVisitGapDays: z.number().nonnegative().nullable(), isLoyal: z.boolean(), firstReturnAt: optionalTimestamp,
  wallet: z.object({
    firstDownloadAt: optionalTimestamp, lastDownloadAt: optionalTimestamp, downloads: count,
    firstGoogleSaveAt: optionalTimestamp, lastGoogleSaveAt: optionalTimestamp, googleSaveLinks: count,
    firstInstalledAt: optionalTimestamp, lastInstalledAt: optionalTimestamp, installedDevices: count,
  }),
});
export const brandAnalyticsReportSchema = z.object({
  generatedAt: timestamp, timeZone: z.literal("Asia/Riyadh"), days: brandAnalyticsDaysSchema,
  recordingStartedAt: optionalTimestamp, walletRecordingStartedAt: optionalTimestamp,
  summary: z.object({ brands: count, registeredCustomers: count, cardholders: count, activeCustomers: count,
    inactiveCustomers: count, returningCustomers: count, loyalCustomers: count, walletCustomers: count }),
  brands: z.array(brandAnalyticsBrandSchema),
});
export const brandAnalyticsDetailSchema = z.object({
  generatedAt: timestamp, days: brandAnalyticsDaysSchema, brand: brandAnalyticsBrandSchema,
  heatmap: z.array(z.object({ day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23), visits: count })).max(168),
  cohorts: z.array(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), issued: count,
    retention: z.array(brandAnalyticsRetentionSchema).length(3) })),
  customers: z.array(brandAnalyticsCustomerSchema).max(100), total: count,
  page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
});
export const brandAnalyticsCustomerDetailSchema = z.object({
  generatedAt: timestamp, customer: brandAnalyticsCustomerSchema,
  events: z.array(z.object({ id: z.string(), at: timestamp,
    kind: z.enum(["stamp", "redeem", "coupon_redeemed", "card_issued", "download", "save_link", "installed", "unregistered"]),
    provider: z.enum(["apple", "google"]).nullable(), origin: z.enum(["live", "historical"]),
    stampsDelta: z.number().int(), rewardName: z.string().nullable() })).max(100),
  total: count, page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
});
export const brandAnalyticsFiltersSchema = z.object({
  brandId: z.uuid(), days: brandAnalyticsDaysSchema.default(30), search: z.string().trim().max(100).default(""),
  segment: z.enum(["all", "inactive", "loyal", "returning", "new", "no_card"]).default("all"),
  sort: z.enum(["recent", "inactive", "visits", "name"]).default("recent"),
  page: z.number().int().min(1).max(100000).default(1), asOf: timestamp.optional(),
}).strict();
export const brandAnalyticsCustomerInputSchema = z.object({
  brandId: z.uuid(), customerId: z.uuid(), page: z.number().int().min(1).max(100000).default(1),
}).strict();

export type BrandAnalyticsDays = z.infer<typeof brandAnalyticsDaysSchema>;
export type BrandAnalyticsBrand = z.infer<typeof brandAnalyticsBrandSchema>;
export type BrandAnalyticsCustomer = z.infer<typeof brandAnalyticsCustomerSchema>;
export type BrandAnalyticsReport = z.infer<typeof brandAnalyticsReportSchema>;
export type BrandAnalyticsDetail = z.infer<typeof brandAnalyticsDetailSchema>;
export type BrandAnalyticsCustomerDetail = z.infer<typeof brandAnalyticsCustomerDetailSchema>;
export type BrandAnalyticsFilters = z.input<typeof brandAnalyticsFiltersSchema>;
export type BrandAnalyticsResult<T> = { ok: true; data: T } | { ok: false; message: string };
export type BrandAnalyticsExport = {
  report: BrandAnalyticsDetail;
  customers: BrandAnalyticsCustomer[];
  recordingStartedAt: string | null;
  walletRecordingStartedAt: string | null;
  generatedAt: string;
};
