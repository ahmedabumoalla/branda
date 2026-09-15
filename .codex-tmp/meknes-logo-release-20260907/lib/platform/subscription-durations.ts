import type { PlatformPlan } from "@/lib/platform/admin-data";

export type SubscriptionDurationOption = {
  label: string;
  months: number;
  badge?: string;
};

export const DEFAULT_SUBSCRIPTION_DURATIONS: SubscriptionDurationOption[] = [
  { label: "شهر واحد", months: 1 },
  { label: "شهرين", months: 2 },
  { label: "سنة", months: 12, badge: "الأكثر اختيارًا" },
  { label: "سنتين", months: 24, badge: "أفضل قيمة" },
];

export function sanitizeDurationMonths(value: unknown) {
  const months = Number(value);
  if ([1, 2, 12, 24].includes(months)) return months;
  return 1;
}

export function getPlanDurationOptions(plan?: Pick<PlatformPlan, "durationOptions"> | null) {
  const requested = Array.isArray(plan?.durationOptions) && plan.durationOptions.length
    ? plan.durationOptions
    : DEFAULT_SUBSCRIPTION_DURATIONS.map((item) => item.months);
  const allowed = Array.from(new Set(requested.map(sanitizeDurationMonths))).filter(Boolean);
  const safe = allowed.length ? allowed : [1, 2, 12, 24];
  return DEFAULT_SUBSCRIPTION_DURATIONS.filter((item) => safe.includes(item.months));
}

export function isPlanOfferActive(plan: Pick<PlatformPlan, "offerEnabled" | "offerPrice" | "offerEndsAt">) {
  if (!plan.offerEnabled || typeof plan.offerPrice !== "number") return false;
  if (!plan.offerEndsAt) return true;
  const until = new Date(plan.offerEndsAt).getTime();
  return Number.isFinite(until) ? Date.now() <= until : true;
}

export function getPlanMonthlyAmount(plan: Pick<PlatformPlan, "priceMonthly" | "offerEnabled" | "offerPrice" | "offerEndsAt">) {
  return isPlanOfferActive(plan) && typeof plan.offerPrice === "number" ? plan.offerPrice : plan.priceMonthly;
}

export function calculateSubscriptionAmount(
  plan: Pick<PlatformPlan, "priceMonthly" | "offerEnabled" | "offerPrice" | "offerEndsAt">,
  months: number,
) {
  const safeMonths = sanitizeDurationMonths(months);
  return Math.max(0, Math.round(getPlanMonthlyAmount(plan) * safeMonths * 100) / 100);
}

export function formatSubscriptionDuration(months: number) {
  const safeMonths = sanitizeDurationMonths(months);
  if (safeMonths === 1) return "شهر واحد";
  if (safeMonths === 2) return "شهرين";
  if (safeMonths === 12) return "سنة";
  if (safeMonths === 24) return "سنتين";
  return `${safeMonths} شهر`;
}
