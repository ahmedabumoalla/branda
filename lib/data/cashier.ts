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
  cafe: { id: string; name: string; slug: string; businessCategory?: string };
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
    cafe: {
      ...payload.cafe,
      businessCategory:
        payload.cafe.businessCategory ??
        (payload.cafe as Record<string, unknown>).business_category?.toString() ??
        "cafes_coffee",
    },
    cashier: payload.cashier,
    orders: Array.isArray(payload.orders) ? payload.orders : [],
    reservations: Array.isArray(payload.reservations)
      ? payload.reservations
      : [],
    logs: Array.isArray(payload.logs)
      ? payload.logs.filter((log) => !["login", "logout", "cashier_login", "cashier_logout", "session_start", "session_end"].includes(String((log as Record<string, unknown>).actionType ?? (log as Record<string, unknown>).action_type ?? "")))
      : [],
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
  const normalized = normalizeConsolePayload(data);
  if (!normalized?.cafe.id) return normalized;
  const { data: cafe } = await supabase
    .from("cafes")
    .select("business_category")
    .eq("id", normalized.cafe.id)
    .maybeSingle();
  return {
    ...normalized,
    cafe: {
      ...normalized.cafe,
      businessCategory: cafe?.business_category ?? normalized.cafe.businessCategory ?? "cafes_coffee",
    },
  };
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
        text: `تم تأكيد حضور حجزك في ${String(cafe?.name ?? "برندة")}.`,
        html: `<div dir="rtl"><h2>تم تأكيد حضور الحجز</h2><p>العلامة: ${escapeEmailHtml(String(cafe?.name ?? "برندة"))}</p><p>نوع الحجز: ${escapeEmailHtml(String(reservation?.event_type ?? "حجز"))}</p><p>التاريخ: ${escapeEmailHtml(String(reservation?.reservation_date ?? ""))} ${escapeEmailHtml(String(reservation?.reservation_time ?? ""))}</p></div>`,
      }).catch(() => undefined);
    }
  }
  return result;
}

function makeLoyaltyScanReference(cardCode: string) {
  const normalized =
    cardCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 64) || "CARD";
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `LOYALTY-CARD-${normalized}-${Date.now()}-${suffix}`;
}

export async function cashierScanLoyalty(input: {
  cafeId: string;
  cardCode: string;
  invoiceBarcode?: string;
  invoiceAmount?: number;
  operation?: "stamp" | "redeem";
}) {
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");

  const normalizedCardCode =
    parseBarndaksaQrPayload(input.cardCode, "loyalty-card") ??
    input.cardCode.trim().toUpperCase();

  const normalizedInvoiceBarcode = input.invoiceBarcode?.trim()
    ? parseBarndaksaQrPayload(input.invoiceBarcode, "invoice") ?? input.invoiceBarcode.trim()
    : makeLoyaltyScanReference(normalizedCardCode);

  const admin = createAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("cafe_cashier_sessions")
    .select("cafe_id,revoked_at,expires_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || session.revoked_at) throw new Error("جلسة الكاشير منتهية");

  const currentCafeId = String(session.cafe_id);
  if (input.cafeId && input.cafeId !== currentCafeId) {
    throw new Error("جلسة الكاشير لا تطابق العلامة التجارية");
  }

  const { data: scannedCard, error: cardLookupError } = await admin
    .from("loyalty_cards")
    .select("id,cafe_id")
    .eq("card_code", normalizedCardCode)
    .maybeSingle();

  if (cardLookupError) throw cardLookupError;
  if (scannedCard && String(scannedCard.cafe_id) !== currentCafeId) {
    console.warn("[cashierScanLoyalty:cross-cafe-card]", {
      currentCafeId,
      rewardCafeId: String(scannedCard.cafe_id),
      reason: "loyalty_card_belongs_to_another_cafe",
    });
    throw new Error("هذه المكافأة تابعة لعلامة تجارية أخرى");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_loyalty_card_operation", {
    p_cafe_id: currentCafeId,
    p_card_code: normalizedCardCode,
    p_invoice_barcode: normalizedInvoiceBarcode,
    p_invoice_amount: input.invoiceAmount ?? 0,
    p_operation: input.operation ?? "stamp",
    p_cashier_session_token: token,
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}
