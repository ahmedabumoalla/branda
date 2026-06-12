
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { parseBrandaQrPayload } from "@/lib/loyalty/secure-qr-payload";

export const cashierSessionCookie = "branda_cashier_session";

export type CashierConsole = {
  cafe: { id: string; name: string; slug: string };
  cashier: { id: string; fullName: string; email: string; employeeNumber?: string | null };
  orders: Array<Record<string, unknown>>;
  reservations: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
};

function normalizeConsolePayload(data: unknown): CashierConsole | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as CashierConsole;
  if (!payload.cafe?.id || !payload.cashier?.id) return null;
  return {
    cafe: payload.cafe,
    cashier: payload.cashier,
    orders: Array.isArray(payload.orders) ? payload.orders : [],
    reservations: Array.isArray(payload.reservations) ? payload.reservations : [],
    logs: Array.isArray(payload.logs) ? payload.logs : [],
  };
}

export async function loginCashierWithPassword(email: string, password: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("login_cafe_cashier", {
    p_email: email.trim().toLowerCase(),
    p_password: password,
  });
  if (error || !Array.isArray(data) || !data[0]?.token) return null;

  const token = String(data[0].token);
  const store = await cookies();
  store.set(cashierSessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return {
    token,
    cafeId: String(data[0].cafe_id),
    cashierId: String(data[0].cashier_id),
    cashierName: String(data[0].cashier_name),
    cafeName: String(data[0].cafe_name),
    cafeSlug: String(data[0].cafe_slug),
  };
}

export async function getCashierToken() {
  const store = await cookies();
  return store.get(cashierSessionCookie)?.value ?? null;
}

export async function getCashierConsole(): Promise<CashierConsole | null> {
  const token = await getCashierToken();
  if (!token) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cashier_console", { p_session_token: token });
  if (error || !data) return null;
  return normalizeConsolePayload(data);
}

export async function logoutCashier() {
  const token = await getCashierToken();
  const store = await cookies();
  if (token) {
    const supabase = await createClient();
    await supabase.rpc("logout_cafe_cashier", { p_session_token: token });
  }
  store.delete(cashierSessionCookie);
}

export async function cashierAcceptOrder(orderId: string) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cashier_accept_order", { p_session_token: token, p_order_id: orderId });
  if (error) throw error;
}

export async function cashierAcceptReservation(reservationId: string) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cashier_accept_reservation", { p_session_token: token, p_reservation_id: reservationId });
  if (error) throw error;
}

export async function cashierConfirmReservationCode(code: string) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_reservation_code", {
    p_session_token: token,
    p_code: code,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function cashierScanLoyalty(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode: string;
  invoiceAmount: number;
  operation: "stamp" | "redeem";
}) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_loyalty_card_operation", {
    p_cafe_id: input.cafeId,
    p_card_code: parseBrandaQrPayload(input.cardCode, "loyalty-card") ?? input.cardCode.trim().toUpperCase(),
    p_invoice_barcode: parseBrandaQrPayload(input.invoiceBarcode, "invoice") ?? input.invoiceBarcode.trim(),
    p_invoice_amount: input.invoiceAmount,
    p_operation: input.operation,
    p_cashier_session_token: token,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}
