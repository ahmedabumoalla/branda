"use server";

import { getCashierConsole, requireCashierPermission } from "@/lib/data/cashier";
import { getLoyaltyBrand } from "@/lib/data/loyalty-experience";
import { getPagerPage, getStaffPagerContext } from "@/lib/data/pager";
import { cashierWorkspaceKey } from "@/lib/cashier/workspace-session";
import type { StaffScreen, StaffScreenResult } from "@/lib/cashier/workspace-types";

export async function loadStaffScreenAction(screen: StaffScreen, expectedSession: string): Promise<StaffScreenResult> {
  if (screen !== "loyalty" && screen !== "pager") return { ok: false };
  try {
    const session = await requireCashierPermission(screen);
    if (cashierWorkspaceKey(session.token) !== expectedSession) return { ok: false, reset: true };
    if (session.businessCategory === "hair_salons") return { ok: false };
    if (screen === "pager") {
      const [context, page] = await Promise.all([getStaffPagerContext(), getPagerPage({ status: "waiting" }, "staff")]);
      return { ok: true, value: { screen, context, page } };
    }
    const data = await getCashierConsole({ recordEntry: false });
    if (!data) return { ok: false };
    const brand = await getLoyaltyBrand(data.cafe.slug);
    return { ok: true, value: { screen, data, identity: brand?.identity } };
  } catch {
    return { ok: false };
  }
}
