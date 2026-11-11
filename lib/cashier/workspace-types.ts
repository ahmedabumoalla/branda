import type { CashierConsole } from "@/lib/data/cashier";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { PagerContext, PagerPage } from "@/lib/pager/types";

export type StaffScreen = "loyalty" | "pager";
export type StaffScreenData =
  | { screen: "loyalty"; data: CashierConsole; identity?: LoyaltyIdentity }
  | { screen: "pager"; context: PagerContext; page: PagerPage };
export type StaffScreenResult = { ok: true; value: StaffScreenData } | { ok: false; reset?: boolean };
export const staffScreenPath = (screen: StaffScreen) => screen === "pager" ? "/pager" : "/cashier";
export function staffScreenFromPath(path: string): StaffScreen | null {
  return path === "/pager" ? "pager" : path === "/cashier" ? "loyalty" : null;
}
