import type { PlatformPlan } from "@/lib/platform/admin-data";

// A free trial has one duration source: the configured trial days.
// Complimentary non-trial grants and paid billing periods keep their duration.
export function normalizeTrialDuration<T extends Pick<PlatformPlan, "priceMonthly" | "trialDays" | "durationUnit" | "durationCount">>(plan: T): T {
  return plan.priceMonthly === 0 && (plan.trialDays ?? 0) > 0
    ? { ...plan, durationUnit: "day", durationCount: plan.trialDays! }
    : plan;
}
