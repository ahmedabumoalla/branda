
"use server";

import {
  getOwnerVisitAnalytics,
  setOwnerCustomerStatus,
  trackCafeVisit,
} from "@/lib/data/platform-upgrade";

export async function setCustomerStatusAction(customerId: string, status: "active" | "suspended" | "blocked") {
  await setOwnerCustomerStatus(customerId, status);
}

export async function fetchVisitAnalyticsAction() {
  return getOwnerVisitAnalytics();
}

export async function trackCafeVisitAction(input: {
  slug: string;
  sessionId: string;
  path: string;
  referrer?: string;
  durationSeconds?: number;
}) {
  await trackCafeVisit(input);
}
