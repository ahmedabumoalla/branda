import type { PlatformPlan } from "@/lib/platform/admin-data";
export type SubscriptionDurationOption = { label: string; months: number; badge?: string };
export const DEFAULT_SUBSCRIPTION_DURATIONS: SubscriptionDurationOption[] = [
  { label: "شهر واحد", months: 1 }, { label: "ثلاثة أشهر", months: 3 },
  { label: "ستة أشهر", months: 6 }, { label: "سنة", months: 12 },
];
export function sanitizeDurationMonths(value: unknown) {
  const months = Number(value);
  if (![1, 3, 6, 12].includes(months)) throw new Error("اختر مدة اشتراك صحيحة");
  return months;
}
export function getPlanDurationOptions(_plan?: Pick<PlatformPlan, "durationOptions"> | null) { return DEFAULT_SUBSCRIPTION_DURATIONS; }
export function isPlanOfferActive(_plan: Pick<PlatformPlan, "offerEnabled" | "offerPrice" | "offerEndsAt">) { return false; }
export function getPlanMonthlyAmount(plan: Pick<PlatformPlan, "priceMonthly">) { return plan.priceMonthly; }
export function calculateSubscriptionPricing(plan: Pick<PlatformPlan, "priceMonthly" | "annualDiscountPercent">, months: number) {
  const baseCents = Math.round(plan.priceMonthly * 100) * sanitizeDurationMonths(months);
  const discountPercent = months === 12 ? Math.min(100, Math.max(0, plan.annualDiscountPercent ?? 0)) : 0;
  const discountCents = Math.round(baseCents * Math.round(discountPercent * 100) / 10000);
  return { baseAmount: baseCents / 100, discountPercent, discountAmount: discountCents / 100, totalAmount: (baseCents - discountCents) / 100 };
}
export function calculateSubscriptionAmount(plan: Pick<PlatformPlan, "priceMonthly" | "annualDiscountPercent">, months: number) { return calculateSubscriptionPricing(plan, months).totalAmount; }
export function formatSubscriptionDuration(months: number) {
  // Preserve labels for historical requests
  return ({ 1: "شهر واحد", 2: "شهرين", 3: "ثلاثة أشهر", 6: "ستة أشهر", 12: "سنة", 24: "سنتين" } as Record<number, string>)[months] ?? `${months} شهر`;
}
