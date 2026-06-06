
"use server";

import {
  getOwnerVisitAnalytics,
  saveOwnerReservationService,
  setOwnerCustomerStatus,
  trackCafeVisit,
} from "@/lib/data/platform-upgrade";

export async function saveReservationServiceAction(input: {
  id?: string;
  name: string;
  description?: string;
  price?: number | null;
  isFree: boolean;
  maxGuests?: number | null;
  availableSlots: string[];
  imageAssetId?: string;
  videoAssetId?: string;
  active: boolean;
  sortOrder: number;
}) {
  return saveOwnerReservationService(input);
}

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
