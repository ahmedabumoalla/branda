"use server";

import { redirect } from "next/navigation";
import {
  cashierAcceptOrder,
  cashierAcceptReservation,
  cashierScanLoyalty,
  getCashierConsole,
  loginCashierWithPassword,
  logoutCashier,
} from "@/lib/data/cashier";

export async function loginCashierAction(email: string, password: string) {
  const result = await loginCashierWithPassword(email, password);

  if (!result) {
    return {
      ok: false as const,
      message: "بيانات الكاشير غير صحيحة",
      redirectTo: null,
    };
  }

  return {
    ok: true as const,
    message: "تم تسجيل الدخول",
    redirectTo: "/cashier",
  };
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

export async function cashierScanLoyaltyAction(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {
  return cashierScanLoyalty(input);
}
