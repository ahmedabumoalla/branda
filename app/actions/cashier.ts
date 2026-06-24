
"use server";

import { redirect } from "next/navigation";
import {
  cashierAcceptOrder,
  cashierAcceptReservation,
  cashierConfirmEventTicket,
  cashierConfirmReservationCode,
  cashierScanLoyalty,
  cashierUpdateOrderStatus,
  cashierUpdateReservationStatus,
  getCashierConsole,
  loginCashierWithPassword,
  logoutCashier,
} from "@/lib/data/cashier";
import { redeemCashierExperienceReward } from "@/lib/data/experience-rewards";

export async function loginCashierAction(email: string, password: string) {
  const result = await loginCashierWithPassword(email, password);
  if (!result) return { ok: false as const, message: "بيانات الكاشير غير صحيحة", redirectTo: null };
  return { ok: true as const, message: "تم تسجيل الدخول", redirectTo: "/cashier" };
}

export async function logoutCashierAction() {
  await logoutCashier();
  redirect("/login");
}

export async function fetchCashierConsoleAction() {
  return getCashierConsole();
}

export async function acceptCashierOrderAction(orderId: string) {
  await cashierAcceptOrder(orderId);
}

export async function acceptCashierReservationAction(reservationId: string) {
  await cashierAcceptReservation(reservationId);
}

export async function updateCashierOrderStatusAction(
  orderId: string,
  status: "accepted" | "rejected",
  rejectionReason?: string,
) {
  return cashierUpdateOrderStatus(orderId, status, rejectionReason);
}

export async function updateCashierReservationStatusAction(
  reservationId: string,
  status: "accepted" | "rejected" | "modification_requested",
  message?: string,
) {
  return cashierUpdateReservationStatus(reservationId, status, message);
}

export async function confirmReservationCodeAction(code: string) {
  return cashierConfirmReservationCode(code);
}

export async function confirmCashierTicketAction(code: string) {
  return cashierConfirmEventTicket(code);
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
  return redeemCashierExperienceReward(rewardCode);
}
