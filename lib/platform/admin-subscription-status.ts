import { isCurrentSubscription } from "@/lib/platform/active-subscription";

export function adminSubscriptionSummary(rows: Record<string, unknown>[], now = Date.now()) {
  const ordered = [...rows].sort((a, b) => (Date.parse(String(b.created_at ?? "")) || 0) - (Date.parse(String(a.created_at ?? "")) || 0) || String(b.id ?? "").localeCompare(String(a.id ?? "")));
  const prepared = (item: Record<string, unknown>) => item.activation_source === "admin_prepared_trial" && item.status === "trialing";
  // Match the administrative RPC's standing cohort. Date-expired or scheduled
  // assignments stay manageable; archived cancelled/expired rows do not.
  const standing = ordered.filter(item => ["active", "trialing"].includes(String(item.status)) && (item.platform_plans as { active?: boolean } | null)?.active === true);
  const current = standing.filter(item => isCurrentSubscription({
    status: String(item.status), started_at: item.started_at ? String(item.started_at) : null,
    expires_at: item.expires_at ? String(item.expires_at) : null,
    platform_plans: item.platform_plans as { active?: boolean },
  }, now));
  const row = current.find(item => item.status === "active") ?? current[0]
    ?? standing.find(item => item.status === "active") ?? standing[0] ?? ordered[0];
  const cohort = row && standing.includes(row) ? [row, ...standing.filter(item => item !== row)] : standing;
  const allPrepared = cohort.length > 0 && cohort.every(prepared);
  const awaitingDelivery = allPrepared;
  const planIds = [...new Set(cohort.map(item => String(item.plan_id ?? "")).filter(Boolean))];
  const activePlanIds = [...new Set(cohort.filter(item => current.includes(item)).map(item => String(item.plan_id ?? "")).filter(Boolean))];
  const name = (item: Record<string, unknown>) => String(item.plan_name_snapshot ?? (item.platform_plans as { name?: string } | null)?.name ?? item.plan_id ?? "");
  const planNames = planIds.map(id => name(cohort.find(item => String(item.plan_id) === id)!));
  const expiryKey = (item: Record<string, unknown>) => {
    if (!item.expires_at) return "unlimited";
    const value = String(item.expires_at), parsed = Date.parse(value);
    // Preserve PostgreSQL sub-millisecond precision when comparing deadlines.
    const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/)?.[1] ?? "";
    return Number.isFinite(parsed) ? `${parsed}:${fraction.padEnd(6, "0").slice(3, 6)}` : `invalid:${value}`;
  };
  const subscriptionExpiryMixed = !allPrepared && new Set(cohort.map(expiryKey)).size > 1;
  const startedAt = row?.started_at ? String(row.started_at) : undefined;
  const expiresAt = !subscriptionExpiryMixed && !allPrepared && row?.expires_at ? String(row.expires_at) : undefined;
  const hasActivePlan = current.length > 0;
  const expiry = expiresAt ? Date.parse(expiresAt) : null;
  const primaryExpiry = row?.expires_at ? Date.parse(String(row.expires_at)) : null;
  const subscriptionStatus = !row ? "بدون اشتراك" : hasActivePlan ? "فعال"
    : row.status === "expired" || (primaryExpiry !== null && primaryExpiry <= now) ? "منتهي"
    : row.status === "cancelled" ? "ملغي"
    : startedAt && Date.parse(startedAt) > now ? "لم يبدأ بعد"
    : ["past_due", "pending"].includes(String(row.status)) ? "بانتظار التفعيل" : "غير فعال";
  return {
    subscriptionId: row?.id ? String(row.id) : null,
    subscriptionUpdatedAt: row?.updated_at ? String(row.updated_at) : null,
    planExpiresAtExact: expiresAt && Number.isFinite(Date.parse(expiresAt)) ? expiresAt : null,
    subscriptionExpiryEditable: cohort.some(item => !prepared(item) && Boolean(item.started_at) && Date.parse(String(item.started_at)) <= now),
    subscriptionExpiryMixed,
    planId: row ? String(row.plan_id ?? "") : "",
    planIds,
    activePlanIds,
    planNames,
    planName: planNames.length ? planNames.join(" + ") : row ? name(row) : "",
    trialAwaitingDelivery: awaitingDelivery,
    planStartedAt: row && !prepared(row) && startedAt && Number.isFinite(Date.parse(startedAt)) ? new Date(startedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) : null,
    planExpiresAt: expiresAt && Number.isFinite(Date.parse(expiresAt)) ? new Date(expiresAt).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) : null,
    planRemainingDays: expiry !== null && Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / 86400000)) : null,
    hasActivePlan,
    subscriptionStatus,
  };
}
