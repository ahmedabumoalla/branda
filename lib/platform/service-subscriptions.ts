import { isCurrentSubscription } from "@/lib/platform/active-subscription";
import type { SubscriptionSummary } from "@/lib/platform/subscription-clock";

/** Server-validated, allowlisted subscription data used by the navigation clock. */
export type ServiceSubscription = SubscriptionSummary & {
  planId: string;
  features: string[];
};

export function getServiceSubscriptionAccess(subscriptions: readonly ServiceSubscription[], now = Date.now()) {
  const current = subscriptions.filter((subscription) => isCurrentSubscription({
    status: subscription.status,
    started_at: subscription.startedAt,
    expires_at: subscription.expiresAt,
    platform_plans: { active: true },
  }, now));
  // Paid packages take precedence over trial messaging, without discarding trial entitlements.
  const primary = current.find((subscription) => subscription.status === "active") ?? current[0] ?? null;
  const transitions = subscriptions.flatMap((subscription) => [subscription.startedAt, subscription.expiresAt])
    .filter((date): date is string => Boolean(date) && Number.isFinite(Date.parse(date!)) && Date.parse(date!) > now);
  const nextChangeAt = transitions.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  return {
    planId: primary?.planId ?? "",
    subscription: primary,
    features: Array.from(new Set(current.flatMap((subscription) => subscription.features))),
    nextChangeAt,
    subscriptions: current,
  };
}
