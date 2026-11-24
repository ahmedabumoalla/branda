import { z } from "zod";
import type { BranchReportFilters } from "./branch-report-types";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const branchSelectionSchema = z.union([z.string().uuid(), z.literal(""), z.literal("unassigned")]);
const filterSchema = z.object({
  from: z.union([calendarDate, z.literal("")]), to: z.union([calendarDate, z.literal("")]),
  branchId: branchSelectionSchema, search: z.string().trim().max(80), page: z.number().int().min(1).max(1000000),
}).strict().refine(value => (!value.from && !value.to) || (Boolean(value.from && value.to) && value.from <= value.to));

export function parseBranchReportFilters(input: BranchReportFilters) {
  const filters = filterSchema.parse(input);
  return { filters, from: filters.from ? new Date(`${filters.from}T00:00:00+03:00`).toISOString() : null,
    to: filters.to ? new Date(Date.parse(`${filters.to}T00:00:00+03:00`) + 86400000).toISOString() : null };
}
const count = z.number().int().nonnegative();
const date = z.string().datetime({ offset: true });
const optionalDate = date.nullable();
const lastActivity = { lastActivityAt: optionalDate, lastActivityKind: z.string().max(80).nullable() };
export const branchReportSummarySchema = z.object({
  issuedCards: count, downloadedCards: count, appleInstalledCards: count, googleSaveLinks: count,
  stamps: count, redemptions: count, customers: count, staff: count, ...lastActivity,
});
export const branchReportBranchSchema = branchReportSummarySchema.extend({
  id: z.string().uuid().nullable(), name: z.string().max(1000), active: z.boolean(), address: z.string(),
  city: z.string(), phone: z.string(), workingHours: z.string(), createdAt: optionalDate,
});
export const loyaltyBranchReportPageSchema = z.object({
  summary: branchReportSummarySchema, branches: z.array(branchReportBranchSchema),
  customers: z.array(z.object({
    id: z.string().uuid(), cardId: z.string().uuid(), name: z.string().max(1000), phone: z.string().nullable(),
    branchId: z.string().uuid().nullable(), branchName: z.string().max(1000), issuedAt: date,
    source: z.enum(["cashier", "registration", "unknown"]), cashierId: z.string().uuid().nullable(), cashierName: z.string().nullable(),
    downloadedAt: optionalDate, appleInstalledAt: optionalDate, googleSaveLinkAt: optionalDate,
    stamps: count, redemptions: count, ...lastActivity,
  })).max(500),
  staff: z.array(z.object({
    id: z.string().uuid(), name: z.string().max(1000), active: z.boolean(), branchId: z.string().uuid().nullable(),
    branchName: z.string().max(1000), issuedCards: count, stamps: count, redemptions: count, ...lastActivity,
  })),
  total: count, page: z.number().int().positive(), pageSize: z.number().int().min(1).max(500), asOf: date,
});
