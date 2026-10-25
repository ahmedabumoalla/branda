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
export function normalizePosCustomerPhone(input: string): string | null {
  if (typeof input !== "string" || input.length > 30) return null;
  const western = input.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
  if (!western || !/^[+\d\s()-]+$/.test(western)) return null;
  let digits = western.replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  if (digits.startsWith("05")) digits = `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) digits = `966${digits}`;
  return /^9665\d{8}$/.test(digits) ? digits : null;
}
