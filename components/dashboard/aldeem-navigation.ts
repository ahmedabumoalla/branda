import { HeartHandshake, LayoutDashboard } from "lucide-react";
import type { SystemGroup } from "./integrated-system-navigation";

// User mandate 2026-11-15: the Aldeem sidebar follows the daily flow of a sweets chain, starting with the
// overview landing page. Presentation only: it grants and revokes nothing, permissions stay in the database.
const order = [
  "overview", "sales", "pos", "store", "manufacturing", "families", "inventory", "purchases", "customers", "loyalty", "credits", "memberships",
  "finance", "accounting", "branches", "employees", "organization", "attendance", "payroll", "requests", "tasks", "workflows", "work-orders", "targets",
  "reports", "templates", "settings",
];
// Sections of other industries that a sweets chain does not operate
const hidden = new Set(["bookings", "contracting", "installments", "rentals", "time"]);

export function aldeemSystemGroups(groups: SystemGroup[]): SystemGroup[] {
  const prepared: SystemGroup[] = [
    { id: "overview", label: "نظرة عامة", icon: LayoutDashboard, direct: true, items: [{ label: "نظرة عامة", href: "/dashboard/system/overview" }] },
    { id: "families", label: "الأسر المنتجة", icon: HeartHandshake, direct: true, items: [{ label: "الأسر المنتجة", href: "/dashboard/system/families" }] },
    ...groups.filter(group => !hidden.has(group.id)).map(group => {
      if (group.id === "manufacturing") return { ...group, label: "المعمل والتصنيع", items: [{ label: "شاشة طلبات المعمل", href: "/dashboard/system/lab" }, ...group.items, { label: "الأصول والآلات والإهلاك", href: "/dashboard/system/assets" }] };
      if (group.id === "store") return { ...group, label: "المتجر والطلبات", items: [{ label: "طلبات المتجر", href: "/dashboard/orders", feature: "menu" }, ...group.items] };
      return group;
    }),
  ];
  const rank = (id: string) => { const index = order.indexOf(id); return index < 0 ? order.length : index; };
  return prepared.sort((a, b) => rank(a.id) - rank(b.id));
}
