export type LoyaltyCustomerBalance = {
  stampsCollected: number;
  rewardsRedeemed: number;
  availableStampRewards: number;
  pointsBalance: number;
  affordablePointRewards: number | null;
};
export type LoyaltyCustomerRow = { id: string; name: string; joinedAt: string; loyalty: LoyaltyCustomerBalance | null };
export type LoyaltyCustomerPage = { rows: LoyaltyCustomerRow[]; total: number; page: number; pageSize: number };
export type LoyaltyCustomerDetail = { id: string; name: string; phone: string | null; birthdayEnabled?: boolean; birthDate?: string | null };
export type LoyaltyCustomerResult<T> = { ok: true; data: T } | { ok: false; message: string };
