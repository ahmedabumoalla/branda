import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { createNotification } from "@/lib/data/notifications";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";

export const cashierSessionCookie = "barndaksa_cashier_session";

export type CashierConsole = {
  cafe: { id: string; name: string; slug: string };
  cashier: {
    id: string;
    fullName: string;
    email: string;
    employeeNumber?: string | null;
  };
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
    reservations: Array.isArray(payload.reservations)
      ? payload.reservations
      : [],
    logs: Array.isArray(payload.logs) ? payload.logs : [],
  };
}

export async function loginCashierWithPassword(
  email: string,
  password: string,
) {
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
  const { data, error } = await supabase.rpc("get_cashier_console", {
    p_session_token: token,
  });
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
  const { error } = await supabase.rpc("cashier_accept_order", {
    p_session_token: token,
    p_order_id: orderId,
  });
  if (error) throw error;
}

export async function cashierAcceptReservation(reservationId: string) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cashier_accept_reservation", {
    p_session_token: token,
    p_reservation_id: reservationId,
  });
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
  const result = data as Record<string, unknown>;
  const reservationId = result.reservationId
    ? String(result.reservationId)
    : "";
  if (reservationId) {
    const admin = createAdminClient();
    const { data: reservation } = await admin
      .from("reservations")
      .select(
        "id,customer_id,cafe_id,event_type,reservation_date,reservation_time,cafes(name,slug),customer_profiles(email)",
      )
      .eq("id", reservationId)
      .maybeSingle();
    const cafeRaw = Array.isArray(reservation?.cafes)
      ? reservation?.cafes[0]
      : reservation?.cafes;
    const cafe =
      cafeRaw && typeof cafeRaw === "object"
        ? (cafeRaw as Record<string, unknown>)
        : null;
    const customerRaw = Array.isArray(reservation?.customer_profiles)
      ? reservation?.customer_profiles[0]
      : reservation?.customer_profiles;
    const customer =
      customerRaw && typeof customerRaw === "object"
        ? (customerRaw as Record<string, unknown>)
        : null;
    if (reservation?.customer_id && cafe?.slug) {
      await createNotification({
        cafeSlug: String(cafe.slug),
        audience: "customer",
        customerId: String(reservation.customer_id),
        title: "تم تأكيد حضور الحجز",
        body: `تم تأكيد حضور حجزك في ${String(cafe.name ?? "العلامة")}`,
        type: "reservation_accepted",
        meta: { reservationId: String(reservationId) },
      }).catch(() => undefined);
    }
    const customerEmail = customer?.email ? String(customer.email) : undefined;
    if (customerEmail && isBarndaksaEmailConfigured()) {
      await sendBarndaksaEmail({
        to: customerEmail,
        subject: "تم تأكيد حضور حجزك",
        text: `تم تأكيد حضور حجزك في ${String(cafe?.name ?? "بارنداكسا")}.`,
        html: `<div dir="rtl"><h2>تم تأكيد حضور الحجز</h2><p>العلامة: ${escapeEmailHtml(String(cafe?.name ?? "بارنداكسا"))}</p><p>نوع الحجز: ${escapeEmailHtml(String(reservation?.event_type ?? "حجز"))}</p><p>التاريخ: ${escapeEmailHtml(String(reservation?.reservation_date ?? ""))} ${escapeEmailHtml(String(reservation?.reservation_time ?? ""))}</p></div>`,
      }).catch(() => undefined);
    }
  }
  return result;
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
    p_card_code:
      parseBarndaksaQrPayload(input.cardCode, "loyalty-card") ??
      input.cardCode.trim().toUpperCase(),
    p_invoice_barcode:
      parseBarndaksaQrPayload(input.invoiceBarcode, "invoice") ??
      input.invoiceBarcode.trim(),
    p_invoice_amount: input.invoiceAmount,
    p_operation: input.operation,
    p_cashier_session_token: token,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}
