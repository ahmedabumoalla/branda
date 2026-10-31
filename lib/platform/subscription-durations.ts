import type { PlatformPlan } from "@/lib/platform/admin-data";
export type SubscriptionDurationOption = { label: string; months: number; badge?: string };
export const DEFAULT_SUBSCRIPTION_DURATIONS: SubscriptionDurationOption[] = [
  { label: "شهر واحد", months: 1 }, { label: "ثلاثة أشهر", months: 3 },
];
export function sanitizeDurationMonths(value: unknown) {
  const months = Number(value);
  if (![1, 3].includes(months)) throw new Error("الاشتراك متاح لشهر أو ثلاثة أشهر فقط");
  return months;
}
type PricingPlan = Pick<PlatformPlan, "priceMonthly" | "annualDiscountPercent"> & Partial<Pick<PlatformPlan, "id" | "durationOptions">>;
export function getPlanDurationOptions(_plan?: Partial<Pick<PlatformPlan, "id" | "durationOptions">> | null) {
  return DEFAULT_SUBSCRIPTION_DURATIONS;
}
export function validatePlanDurationMonths(plan: Partial<Pick<PlatformPlan, "id" | "durationOptions">>, value: unknown) {
  const months = sanitizeDurationMonths(value);
  if (!getPlanDurationOptions(plan).some(option => option.months === months)) throw new Error("برندة المالية متاحة لشهر أو ثلاثة أشهر");
  return months;
}
export function isPlanOfferActive(_plan: Pick<PlatformPlan, "offerEnabled" | "offerPrice" | "offerEndsAt">) { return false; }
export function getPlanMonthlyAmount(plan: Pick<PlatformPlan, "priceMonthly">) { return plan.priceMonthly; }
/** Shared visibility for the public catalog and the brand subscription chooser. */
export function isPurchasablePlan(plan: Pick<PlatformPlan, "id" | "priceMonthly">) {
  return plan.priceMonthly > 0 && plan.id !== "owner_trial_7d";
}
export function calculateSubscriptionPricing(plan: PricingPlan, months: number) {
  const baseCents = Math.round(plan.priceMonthly * 100) * validatePlanDurationMonths(plan, months);
  // Keep the legacy field name for stored payment snapshots and API compatibility
  const discountPercent = months === 3 ? plan.id === "finance" ? 20 : Math.min(100, Math.max(0, plan.annualDiscountPercent ?? 0)) : 0;
  const discountCents = Math.round(baseCents * Math.round(discountPercent * 100) / 10000);
  return { baseAmount: baseCents / 100, discountPercent, discountAmount: discountCents / 100, totalAmount: (baseCents - discountCents) / 100 };
}
export function calculateSubscriptionAmount(plan: PricingPlan, months: number) { return calculateSubscriptionPricing(plan, months).totalAmount; }
export function formatSubscriptionDuration(months: number) {
  // Preserve labels for historical requests
  return ({ 1: "شهر واحد", 2: "شهرين", 3: "ثلاثة أشهر", 6: "ستة أشهر", 12: "سنة", 24: "سنتين" } as Record<number, string>)[months] ?? `${months} شهر`;
}
