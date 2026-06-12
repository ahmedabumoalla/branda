"use server";

import { getOwnerActivePlanId, getPlatformPlans } from "@/lib/data/admin";
import { getOwnerOrders } from "@/lib/data/orders";
import { getOwnerReservations } from "@/lib/data/reservations";
import { getOwnerExperienceRewardReviews } from "@/lib/data/experience-rewards";
import { getOwnerCafeSettings } from "@/lib/data/settings";
import { getOwnerCafeNotifications } from "@/lib/data/notifications";

export async function fetchOwnerDashboardShellAction() {
  const [planId, plans, settings, reservations, orders, experienceReviews, notifications] = await Promise.all([
    getOwnerActivePlanId(),
    getPlatformPlans(),
    getOwnerCafeSettings(),
    getOwnerReservations(),
    getOwnerOrders(),
    getOwnerExperienceRewardReviews(),
    getOwnerCafeNotifications(),
  ]);

  return {
    planId,
    plans,
    settings,
    notifications,
    pendingReservations: reservations.filter((item) => item.status === "بانتظار الرد").length,
    pendingOrders: orders.filter((item) => item.status === "بانتظار موافقة الكوفي").length,
    pendingExperienceReviews: experienceReviews.filter((item) => item.status === "pending").length,
  };
}
