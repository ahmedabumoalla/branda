import { normalizeBrandPhone, type BrandPhoneCountry } from "@/lib/auth/brand-phone";
export type FinancePosCustomer = {
  phone: string;
  pagerEnabled: boolean;
  loyaltyEnabled: boolean;
  member: null | { name: string; stampsInCycle: number; targetStamps: number; rewardsReady: number };
  rewards: { id: string; title: string; expiresAt?: string | null }[];
};

export type FinancePosCustomerResult = {
  phone: string;
  pagerOrderId: string | null;
  pagerStatus: string;
  loyaltyStatus: "stamped" | "pending_enrollment" | "unavailable";
  rewardRedeemedId: string | null;
  notificationStatus: "pending" | "not_applicable";
};

/** Formatting only; tenant access and membership are verified on the server */
export function normalizePosCustomerPhone(input: string, country: BrandPhoneCountry = "SA"): string | null {
  return typeof input === "string" && input.length <= 30 ? normalizeBrandPhone(input, country) : null;
}
