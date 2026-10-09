export type SubscriptionSummary = {
  status: string;
  startedAt: string | null;
  expiresAt: string | null;
  planName: string;
};

export function subscriptionTimeRemaining(expiresAt: string | null, now: number) {
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(expiry)) return null;
  const seconds = Math.max(0, Math.ceil((expiry - now) / 1000));
  return {
    expired: seconds === 0,
    days: Math.ceil(seconds / 86_400),
    fullDays: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}
