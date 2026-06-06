"use server";

import {
  getOwnerCafeNotifications,
  markNotificationRead,
} from "@/lib/data/notifications";

export async function fetchOwnerNotificationsAction() {
  return getOwnerCafeNotifications();
}

export async function markNotificationReadAction(id: string) {
  await markNotificationRead(id);
}
