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
    | "experience_reward"
    | "new_pickup_order"
    | "new_reservation"
    | "new_review"
    | "experience_submission";
  read: boolean;
  createdAt: string;
  meta?: Record<string, string>;
};

export const NOTIFICATIONS_KEY = "barndaksa_qatrah_notifications";

export function loadNotifications(): AppNotification[] {
  throw new Error("Use Supabase — fetch via lib/data/notifications");
}

export function saveNotifications(_items: AppNotification[]) {
  throw new Error("Use Supabase — save via lib/data/notifications");
}
