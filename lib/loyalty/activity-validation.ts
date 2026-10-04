import { z } from "zod";
import { loyaltyActivityKinds, loyaltyActivityOutcomes, type LoyaltyActivityFilters } from "./activity-types";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "التاريخ غير صالح.");

const filtersSchema = z.object({
  from: calendarDate,
  to: calendarDate,
  cashierId: z.union([z.string().uuid(), z.literal("")]),
  kind: z.union([z.enum(loyaltyActivityKinds), z.literal("")]),
  outcome: z.union([z.enum(loyaltyActivityOutcomes), z.literal("")]),
  search: z.string().trim().max(80),
  page: z.number().int().min(1).max(10000),
}).strict().refine((value) => {
  const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
  return days >= 0 && days <= 365;
}, "اختر فترة صحيحة لا تتجاوز سنة.");

export function parseLoyaltyActivityFilters(input: LoyaltyActivityFilters) {
  const filters = filtersSchema.parse(input);
  // Date inputs are Saudi calendar dates. The upper bound includes the whole last day.
  const from = new Date(`${filters.from}T00:00:00+03:00`).toISOString();
  const to = new Date(Date.parse(`${filters.to}T00:00:00+03:00`) + 86400000).toISOString();
  return { filters, from, to };
}

const nonnegative = z.number().int().nonnegative();
const dateTime = z.string().datetime({ offset: true });
const nullableCount = nonnegative.nullable();
const eventSchema = z.object({
  id: z.string().uuid(), occurredAt: dateTime, recordedAt: dateTime,
  kind: z.enum(loyaltyActivityKinds), outcome: z.enum(loyaltyActivityOutcomes),
  origin: z.enum(["live", "historical"]), cashierId: z.string().uuid().nullable(),
  actorName: z.string().max(240), actorType: z.enum(["cashier", "owner", "unknown"]),
  cardId: z.string().uuid().nullable(), cardSuffix: z.string().max(8).nullable(),
  customerName: z.string().max(240).nullable(), stampsDelta: z.number().int(), rewardsDelta: z.number().int(),
  stampsBefore: nullableCount, stampsAfter: nullableCount, rewardsBefore: nullableCount, rewardsAfter: nullableCount,
  rewardName: z.string().max(1000).nullable(), rewardSuffix: z.string().max(8).nullable(),
  rewardKind: z.string().max(40).nullable(), rewardDiscountPercent: z.number().min(0).max(100).nullable(),
  rewardExpiresAt: dateTime.nullable(), rewardTerms: z.string().max(4000).nullable(),
  reasonCode: z.string().max(100).nullable(),
});

// A deliberate allowlist prevents future DB metadata or bearer codes leaking into the dashboard.
export const loyaltyActivityPageSchema = z.object({
  events: z.array(eventSchema).max(50), total: nonnegative,
  page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50),
  recordingStartedAt: dateTime.nullable(),
  summary: z.object({
    total: nonnegative, scans: nonnegative, stamps: nonnegative, rewardsIssued: nonnegative,
    redemptions: nonnegative, denied: nonnegative, failed: nonnegative, duplicates: nonnegative,
    uniqueCards: nonnegative, activeCashiers: nonnegative,
  }),
  employees: z.array(z.object({
    id: z.string().uuid(), name: z.string().max(240), active: z.boolean(),
    scans: nonnegative, stamps: nonnegative, redemptions: nonnegative,
    denied: nonnegative, failed: nonnegative, duplicates: nonnegative,
    lastActivityAt: dateTime.nullable(),
  })),
});
