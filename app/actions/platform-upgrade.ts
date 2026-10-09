"use server";

import { requireStorefrontEnabled } from "@/lib/platform/storefront-availability";

import {
  getOwnerVisitAnalytics,
  setOwnerCustomerStatus,
  trackCafeVisit,
} from "@/lib/data/platform-upgrade";

export async function setCustomerStatusAction(customerId: string, status: "active" | "suspended" | "blocked") {
  await setOwnerCustomerStatus(customerId, status);
}

export async function fetchVisitAnalyticsAction() {
  requireStorefrontEnabled();
  return getOwnerVisitAnalytics();
}

export async function trackCafeVisitAction(input: {
  slug: string;
  sessionId: string;
  path: string;
  referrer?: string;
  durationSeconds?: number;
}) {
  requireStorefrontEnabled();
  await trackCafeVisit(input);
}
