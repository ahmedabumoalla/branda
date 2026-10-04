export const loyaltyActivityKinds = ["scan", "stamp", "redeem", "void"] as const;
export const loyaltyActivityOutcomes = ["success", "denied", "failed", "duplicate"] as const;
export type LoyaltyActivityKind = (typeof loyaltyActivityKinds)[number];
export type LoyaltyActivityOutcome = (typeof loyaltyActivityOutcomes)[number];

export type LoyaltyActivityFilters = {
  from: string;
  to: string;
  cashierId: string;
  kind: LoyaltyActivityKind | "";
  outcome: LoyaltyActivityOutcome | "";
  search: string;
  page: number;
};

export type LoyaltyActivityEvent = {
  id: string;
  occurredAt: string;
  recordedAt: string;
  kind: LoyaltyActivityKind;
  outcome: LoyaltyActivityOutcome;
  origin: "live" | "historical";
  cashierId: string | null;
  actorName: string;
  actorType: "cashier" | "owner" | "unknown";
  cardId: string | null;
  cardSuffix: string | null;
  customerName: string | null;
  stampsDelta: number;
  rewardsDelta: number;
  stampsBefore: number | null;
  stampsAfter: number | null;
  rewardsBefore: number | null;
  rewardsAfter: number | null;
  rewardName: string | null;
  rewardSuffix: string | null;
  rewardKind: string | null;
  rewardDiscountPercent: number | null;
  rewardExpiresAt: string | null;
  rewardTerms: string | null;
  reasonCode: string | null;
};

export type LoyaltyActivityEmployee = {
  id: string;
  name: string;
  active: boolean;
  scans: number;
  stamps: number;
  redemptions: number;
  denied: number;
  failed: number;
  duplicates: number;
  lastActivityAt: string | null;
};

export type LoyaltyActivitySummary = {
  total: number;
  scans: number;
  stamps: number;
  rewardsIssued: number;
  redemptions: number;
  denied: number;
  failed: number;
  duplicates: number;
  uniqueCards: number;
  activeCashiers: number;
};

export type LoyaltyActivityPage = {
  events: LoyaltyActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
  summary: LoyaltyActivitySummary;
  employees: LoyaltyActivityEmployee[];
  recordingStartedAt: string | null;
};

export type LoyaltyActivityResult =
  | { ok: true; data: LoyaltyActivityPage }
  | { ok: false; message: string };

export function defaultLoyaltyActivityFilters(now = new Date()): LoyaltyActivityFilters {
  const today = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10), cashierId: "", kind: "", outcome: "", search: "", page: 1 };
}
