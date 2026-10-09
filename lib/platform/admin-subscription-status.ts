import { isCurrentSubscription } from "@/lib/platform/active-subscription";

export function adminSubscriptionSummary(rows: Record<string, unknown>[], now = Date.now()) {
  const ordered = [...rows].sort((a, b) => (Date.parse(String(b.created_at ?? "")) || 0) - (Date.parse(String(a.created_at ?? "")) || 0));
  // Match the service gate: newest active/trialing assignment, even if expired.
  const row = ordered.find(item => ["active", "trialing"].includes(String(item.status))) ?? ordered[0];
  const startedAt = row?.started_at ? String(row.started_at) : undefined;
  const expiresAt = row?.expires_at ? String(row.expires_at) : undefined;
  const hasActivePlan = isCurrentSubscription(row ? {
    status: String(row.status), started_at: startedAt, expires_at: expiresAt,
    platform_plans: row.platform_plans as { active?: boolean } | null,
  } : null, now);
  const expiry = expiresAt ? Date.parse(expiresAt) : null;
  const subscriptionStatus = !row ? "بدون اشتراك" : hasActivePlan ? "فعال"
    : row.status === "expired" || (expiry !== null && expiry <= now) ? "منتهي"
    : row.status === "cancelled" ? "ملغي"
    : startedAt && Date.parse(startedAt) > now ? "لم يبدأ بعد"
    : ["past_due", "pending"].includes(String(row.status)) ? "بانتظار التفعيل" : "غير فعال";
  return {
    planId: row ? String(row.plan_id ?? "") : "",
    planName: row ? String(row.plan_name_snapshot ?? row.plan_id ?? "") : "",
    planStartedAt: startedAt && Number.isFinite(Date.parse(startedAt)) ? new Date(startedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) : undefined,
    planExpiresAt: expiresAt && Number.isFinite(Date.parse(expiresAt)) ? new Date(expiresAt).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }) : undefined,
    planRemainingDays: expiry !== null && Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / 86400000)) : null,
    hasActivePlan,
    subscriptionStatus,
  };
}
