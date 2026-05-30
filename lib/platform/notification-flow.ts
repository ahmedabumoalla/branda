import {
  NOTIFICATIONS_KEY,
  type AppNotification,
  type NotificationAudience,
} from "@/lib/mock/notifications";

function pushNotification(notification: Omit<AppNotification, "id" | "createdAt" | "read">) {
  const saved = localStorage.getItem(NOTIFICATIONS_KEY);
  const list = saved ? (JSON.parse(saved) as AppNotification[]) : [];
  const item: AppNotification = {
    ...notification,
    id: `notif_${Date.now()}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify([item, ...list]));
  return item;
}

export function notifyCustomer(input: {
  cafeSlug: string;
  customerId: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  return pushNotification({ ...input, audience: "customer" });
}

export function notifyCafe(input: {
  cafeSlug: string;
  title: string;
  body: string;
  type: AppNotification["type"];
  meta?: Record<string, string>;
}) {
  return pushNotification({ ...input, audience: "cafe" });
}

export function getNotificationsForAudience(
  audience: NotificationAudience,
  cafeSlug: string,
  customerId?: string
) {
  const saved = localStorage.getItem(NOTIFICATIONS_KEY);
  const list = saved ? (JSON.parse(saved) as AppNotification[]) : [];
  return list.filter((n) => {
    if (n.audience !== audience || n.cafeSlug !== cafeSlug) return false;
    if (audience === "customer") return n.customerId === customerId;
    return true;
  });
}

export function markNotificationRead(id: string) {
  const saved = localStorage.getItem(NOTIFICATIONS_KEY);
  const list = saved ? (JSON.parse(saved) as AppNotification[]) : [];
  localStorage.setItem(
    NOTIFICATIONS_KEY,
    JSON.stringify(list.map((n) => (n.id === id ? { ...n, read: true } : n)))
  );
}
