import { isHospitalStore } from "@/lib/commerce/hospital-profile";

// Presentation only: routes, subscription checks and database permissions remain authoritative
const hiddenDomains = new Set([
  "store", "manufacturing", "tasks", "bookings", "contracting", "installments", "commissions",
  "rentals", "work_orders", "workflows", "credits", "loyalty", "memberships", "customer_attendance",
  "insurance", "time", "organization", "attendance", "payroll", "templates", "branches",
]);
const movedOrHiddenTopItems = new Set(["settings", "loyalty", "branches"]);

export function mindErpNavigationVisible(slug: string, domain: string) {
  return !isHospitalStore(slug) || !hiddenDomains.has(domain);
}

export function mindTopNavigationVisible(slug: string, feature: string) {
  return !isHospitalStore(slug) || !movedOrHiddenTopItems.has(feature);
}

export const mindCafeSettingsLink = { label: "إعدادات الكوفي", href: "/dashboard/settings", feature: "settings" };
