import { z } from "zod";

export const engagementKinds = ["menu_view", "menu_loyalty_click", "loyalty_menu_visit", "loyalty_qr_visit", "loyalty_direct_visit"] as const;
export type EngagementKind = typeof engagementKinds[number];
export const engagementInputSchema = z.object({
  slug: z.string().max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(engagementKinds), eventId: z.uuid(), visitorId: z.uuid(),
}).strict();
const date = z.string().refine(value => value === "" || (/^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value));
export const brandAnalyticsInputSchema = z.object({
  brandId: z.uuid(), from: date.default(""), to: date.default(""),
}).strict().refine(input => !input.from || !input.to || input.from <= input.to, { message: "Invalid date range" });
const count = z.number().int().nonnegative();
const engagement = z.object({ events: count, visitors: count });
const operation = z.object({ operations: count, customers: count });
export const brandAnalyticsSchema = z.object({
  brandId: z.uuid(), from: z.string().nullable(), to: z.string().nullable(),
  engagementStartedAt: z.string(), walletStartedAt: z.string(), operationsStartedAt: z.string(),
  engagement: z.object({ menu_view: engagement.optional(), menu_loyalty_click: engagement.optional(),
    loyalty_menu_visit: engagement.optional(), loyalty_qr_visit: engagement.optional(), loyalty_direct_visit: engagement.optional() }),
  wallet: z.object({ customers: count, issuances: count, appleCustomers: count, appleDownloads: count, googleCustomers: count, googleSaveLinks: count }),
  confirmed: z.object({ stamp: operation.optional(), redeem: operation.optional() }),
});
export type BrandAnalytics = z.infer<typeof brandAnalyticsSchema>;
export type BrandAnalyticsInput = z.input<typeof brandAnalyticsInputSchema>;

export function loyaltyVisitKind(source: string | string[] | undefined): EngagementKind {
  if (source === "menu") return "loyalty_menu_visit";
  if (source === "qr") return "loyalty_qr_visit";
  return "loyalty_direct_visit";
}
