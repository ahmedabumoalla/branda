"use server";

import { requireStorefrontEnabled } from "@/lib/platform/storefront-availability";

import { redirect } from "next/navigation";
import {
  cashierAcceptOrder,
  cashierScanLoyalty,
  cashierUpdateOrderStatus,
  getCashierOrders,
  loginCashierWithPassword,
  logoutCashier,
  startOwnerCashierSession,
} from "@/lib/data/cashier";
import { redeemCashierExperienceReward } from "@/lib/data/experience-rewards";
import {
  lookupCashierCustomerReward,
  redeemCashierCustomerReward,
} from "@/lib/data/customer-rewards";

export async function startOwnerCashierAction() {
  try {
    await startOwnerCashierSession();
  } catch {
    return { ok: false as const, message: "تعذر فتح نقطة التشغيل بجلسة المالك تحقق من صلاحياتك وحاول مجددًا" };
  }
  redirect("/cashier");
}

export async function loginCashierAction(email: string, password: string) {
  const result = await loginCashierWithPassword(email, password);
  if (!result) {
    return { ok: false as const, message: "بيانات الكاشير غير صحيحة أو الحساب معطل" };
  }
  redirect("/cashier");
}

export async function logoutCashierAction() {
  await logoutCashier();
  redirect("/cashier/login");
}

export async function fetchCashierOrdersAction() {
  requireStorefrontEnabled();
  return getCashierOrders();
}

export async function acceptCashierOrderAction(orderId: string) {
  requireStorefrontEnabled();
  await cashierAcceptOrder(orderId);
}

export async function updateCashierOrderStatusAction(
  orderId: string,
  status: "accepted" | "rejected" | "completed" | "not_completed",
  rejectionReason?: string,
) {
  requireStorefrontEnabled();
  return cashierUpdateOrderStatus(orderId, status, rejectionReason);
}

export async function cashierScanLoyaltyAction(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  return cashierScanLoyalty(input);
}


export async function cashierRedeemExperienceRewardAction(rewardCode: string) {
  try {
    return await redeemCashierCustomerReward(rewardCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("مكافأة غير موجودة")) throw error;
    return redeemCashierExperienceReward(rewardCode);
  }
}

export async function cashierLookupRewardAction(rewardCode: string) {
  return lookupCashierCustomerReward(rewardCode);
}
