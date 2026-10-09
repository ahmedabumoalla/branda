/** Shared database row validation; inactive, future and expired plans fail closed. */
export function isCurrentSubscription(row: {
  status?: string | null;
  started_at?: string | null;
  expires_at?: string | null;
  platform_plans?: { active?: boolean | null } | null;
} | null | undefined, now = Date.now()) {
  if (!row || !["active", "trialing"].includes(row.status ?? "") || row.platform_plans?.active !== true) return false;
  const start = row.started_at ? Date.parse(row.started_at) : null;
  const end = row.expires_at ? Date.parse(row.expires_at) : null;
  return (start === null || (Number.isFinite(start) && start <= now)) &&
    (end === null || (Number.isFinite(end) && end > now));
}
