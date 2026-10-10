"use client";

import type { EngagementKind } from "./brand-analytics";
import { reportCustomerUsage } from "./customer-usage-tracking";

const visitorStorageKey = "branda-engagement-visitor-v1";
const lifetime = 90 * 24 * 60 * 60 * 1000;
let visitorId: string | undefined;

function getVisitorId(): string {
  if (visitorId) return visitorId;
  try {
    const stored = JSON.parse(localStorage.getItem(visitorStorageKey) || "null");
    if (stored && typeof stored.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored.id)
      && Number.isFinite(stored.expiresAt) && stored.expiresAt > Date.now() && stored.expiresAt <= Date.now() + lifetime) {
      visitorId = stored.id;
    }
  } catch { /* Blocked storage still permits a session-only anonymous identifier. */ }
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    try { localStorage.setItem(visitorStorageKey, JSON.stringify({ id: visitorId, expiresAt: Date.now() + lifetime })); } catch { /* session only */ }
  }
  return visitorId;
}

/** Engagement never grants membership, records stamps, or redeems rewards. */
export function trackBrandEngagement(slug: string, kind: EngagementKind, eventId?: string) {
  try {
    if (kind === "menu_loyalty_click") reportCustomerUsage(slug, kind, eventId ?? crypto.randomUUID(), 0);
    const body = JSON.stringify({ slug, kind, eventId: eventId ?? crypto.randomUUID(), visitorId: getVisitorId() });
    if (navigator.sendBeacon?.("/api/analytics/events", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/analytics/events", { method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "same-origin", body, keepalive: true }).catch(() => {});
  } catch { /* Analytics must never interrupt the customer's flow. */ }
}
