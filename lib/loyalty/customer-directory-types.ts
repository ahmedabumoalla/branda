export type LoyaltyCustomerBalance = {
  mode: "stamps" | "points";
  stampsCollected: number;
  stampsInCycle: number;
  rewardsRedeemed: number;
  availableStampRewards: number;
  pointsEarned: number;
  pointsSpent: number;
  pointsBalance: number;
  affordablePointRewards: number | null;
};
export type LoyaltyCustomerRow = { id: string; name: string; joinedAt: string; loyalty: LoyaltyCustomerBalance | null };
export type LoyaltyCustomerPage = { rows: LoyaltyCustomerRow[]; total: number; page: number; pageSize: number };
export type LoyaltyCustomerDetail = { id: string; name: string; phone: string | null; phoneCountryName?: string; cardStatus?: "active" | "suspended"; suspendableCardId?: string; birthdayEnabled?: boolean; birthDate?: string | null; loyalty: LoyaltyCustomerBalance | null };
export type LoyaltyCustomerResult<T> = { ok: true; data: T } | { ok: false; message: string };
