import { z } from "zod";
import type { BrandCustomerFilters } from "./brand-customer-types";

const count = z.number().int().nonnegative();
const timestamp = z.string().datetime({ offset: true });
const brandSchema = z.object({ id: z.uuid(), name: z.string(), slug: z.string() });
export const brandCustomerSchema = z.object({
  id: z.uuid(), cardId: z.uuid().nullable(), name: z.string(), phone: z.string(), email: z.string(),
  brand: brandSchema, sharedBrands: z.array(brandSchema), identityMatch: z.enum(["phone", "account", "profile"]),
  status: z.enum(["active", "blocked", "suspended"]), cardSuffix: z.string().max(4).nullable(),
  joinedAt: timestamp, cardIssuedAt: timestamp.nullable(), lastActivityAt: timestamp.nullable(),
  stamps: count, stampsInCycle: count, stampTarget: z.number().int().positive(), stampTransactions: count, scans: count,
  rewardsEarned: count, rewardsRedeemed: count, rewardsExpired: count, rewardsAvailable: count, isFrequent: z.boolean(),
  firstDownloadAt: timestamp.nullable(), lastDownloadAt: timestamp.nullable(), downloadCount: count,
  firstInstalledAt: timestamp.nullable(), installedDeviceCount: count, walletProviders: z.array(z.enum(["apple", "google"])),
});

export const brandCustomersPageSchema = z.object({
  customers: z.array(brandCustomerSchema).max(50),
  brands: z.array(brandSchema.extend({ customers: count, stamps: count, rewardsRedeemed: count })),
  summary: z.object({ memberships: count, uniqueCustomers: count, sharedCustomers: count, frequentCustomers: count,
    stamps: count, scans: count, rewardsEarned: count, rewardsRedeemed: count, rewardsExpired: count }),
  total: count, page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50),
  recordingStartedAt: timestamp, walletRecordingStartedAt: timestamp, frequentThreshold: z.number().int().positive(),
});

export const brandCustomerDetailSchema = z.object({
  customer: brandCustomerSchema, memberships: z.array(brandCustomerSchema),
  events: z.array(z.object({
    id: z.string(), occurredAt: timestamp,
    kind: z.enum(["joined", "card_issued", "download", "save_link", "installed", "unregistered", "scan", "stamp", "redeem", "void", "reward_earned", "reward_expired"]),
    outcome: z.enum(["success", "denied", "failed", "duplicate"]), origin: z.enum(["live", "historical"]),
    actorName: z.string().nullable(), stampsDelta: z.number().int(), stampsAfter: z.number().int().nullable(),
    rewardsDelta: z.number().int(), rewardName: z.string().nullable(), rewardExpiresAt: timestamp.nullable(),
    reasonCode: z.string().nullable(), provider: z.enum(["apple", "google"]).nullable(),
  })).max(50),
  total: count, page: z.number().int().positive(), pageSize: z.number().int().min(1).max(50),
});

const filtersSchema = z.object({
  search: z.string().trim().max(100).default(""),
  brandId: z.union([z.uuid(), z.literal("")]).default(""),
  segment: z.enum(["all", "shared", "frequent", "rewarded", "expired"]).default("all"),
  sort: z.enum(["recent", "stamps", "rewards"]).default("recent"),
  page: z.number().int().min(1).max(100000).default(1),
});
export function parseBrandCustomerFilters(input: BrandCustomerFilters) { return filtersSchema.parse(input); }
export const brandCustomerDetailInputSchema = z.object({ customerId: z.uuid(), page: z.number().int().min(1).max(100000) });
