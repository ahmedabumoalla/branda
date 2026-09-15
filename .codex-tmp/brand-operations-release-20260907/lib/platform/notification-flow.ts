import type { AppNotification, NotificationAudience } from "@/lib/mock/notifications";
import {
  createNotification,
  getNotificationsForAudience as getNotificationsForAudienceDb,
  markCustomerNotificationRead,
  markNotificationRead as markNotificationReadDb,
} from "@/lib/data/notifications";

export async function notifyCustomer(input: {
  cafeSlug: string;
  customerId: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  return createNotification({ ...input, audience: "customer" });
}

export async function notifyCafe(input: {
  cafeSlug: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  return createNotification({ ...input, audience: "cafe" });
}

export async function getNotificationsForAudience(
  audience: NotificationAudience,
  cafeSlug: string,
  customerId?: string
) {
  return getNotificationsForAudienceDb(audience, cafeSlug, customerId);
}

export async function markNotificationRead(id: string) {
  await markNotificationReadDb(id);
}

export async function markCustomerNotificationReadById(cafeSlug: string, id: string) {
  await markCustomerNotificationRead(cafeSlug, id);
}
