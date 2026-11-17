// Loco dashboard employee permissions (user request 2026-11-17)
// The keys live in cafe_members.permissions so database policies read the same grant as the app

export type BrandStaffPermission = "menu" | "messages" | "rewards";
export type BrandStaffAccess = Record<BrandStaffPermission, boolean>;

/** cafe_members.permissions keys; "menu" is the existing key used by the menu write policies */
export const brandStaffPermissionKeys: Record<BrandStaffPermission, string> = {
  menu: "menu",
  messages: "staff_loyalty_messages",
  rewards: "staff_loyalty_rewards",
};

export function brandStaffAccessFromPermissions(raw: unknown): BrandStaffAccess {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    menu: value[brandStaffPermissionKeys.menu] === true,
    messages: value[brandStaffPermissionKeys.messages] === true,
    rewards: value[brandStaffPermissionKeys.rewards] === true,
  };
}

/** Dashboard sections an employee may open, in sidebar order */
export const brandStaffSections: Array<{ permission: BrandStaffPermission; href: string; title: string }> = [
  { permission: "menu", href: "/dashboard/menu", title: "المنيو والمنتجات" },
  { permission: "rewards", href: "/dashboard/loyalty", title: "إدارة المكافآت" },
  { permission: "messages", href: "/dashboard/loyalty/messages", title: "إدارة رسائل الولاء" },
];

export function brandStaffLandingPath(access: BrandStaffAccess) {
  return brandStaffSections.find(section => access[section.permission])?.href ?? "/dashboard/staff-home";
}

/** Exact page allow-list; /dashboard/loyalty must not admit /dashboard/loyalty/customers */
export function brandStaffPathAllowed(access: BrandStaffAccess, pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/dashboard/staff-home") return true;
  if (path === "/dashboard/menu") return access.menu;
  if (path === "/dashboard/loyalty") return access.rewards;
  if (path === "/dashboard/loyalty/messages") return access.messages;
  return false;
}
