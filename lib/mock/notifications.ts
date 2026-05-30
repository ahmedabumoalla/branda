export type NotificationAudience = "customer" | "cafe";

export type AppNotification = {
  id: string;
  cafeSlug: string;
  audience: NotificationAudience;
  customerId?: string;
  title: string;
  body: string;
  type:
    | "order_accepted"
    | "order_rejected"
    | "reservation_accepted"
    | "reservation_rejected"
    | "loyalty_points"
    | "experience_approved"
    | "new_pickup_order"
    | "new_reservation"
    | "new_review"
    | "experience_submission";
  read: boolean;
  createdAt: string;
  meta?: Record<string, string>;
};

export const NOTIFICATIONS_KEY = "branda_qatrah_notifications";

export function loadNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem(NOTIFICATIONS_KEY);
  return saved ? (JSON.parse(saved) as AppNotification[]) : [];
}

export function saveNotifications(items: AppNotification[]) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items));
}
