import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { operationEventTypes, recordOperationEvent } from "@/lib/data/operation-events";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { createNotification } from "@/lib/data/notifications";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";

export const cashierSessionCookie = "barndaksa_cashier_session";

export type CashierConsole = {
  cafe: {
    id: string;
    name: string;
    slug: string;
    businessCategory?: string;
    loyaltyCardEnabled?: boolean;
  };
  cashier: {
    id: string;
    fullName: string;
    email: string;
    employeeNumber?: string | null;
  };
  orders: Array<Record<string, unknown>>;
  reservations: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
  operationOrders?: Array<Record<string, unknown>>;
  operationReservations?: Array<Record<string, unknown>>;
  operationTickets?: Array<Record<string, unknown>>;
  operationRewards?: Array<Record<string, unknown>>;
};

function orderIdOf(order: Record<string, unknown>) {
  const raw = order.id ?? order.order_id ?? order.orderId;
  return raw ? String(raw) : "";
}

async function enrichCashierOrdersWithItems(
  consoleData: CashierConsole,
): Promise<CashierConsole> {
  const ordersWithItems = await attachOrderItems(consoleData.orders, consoleData.cafe.id);
  return { ...consoleData, orders: ordersWithItems };
}

async function attachOrderItems(
  orders: Array<Record<string, unknown>>,
  cafeId: string,
) {
  const orderIds = orders
    .map((order) => orderIdOf(order))
    .filter(Boolean);
  if (!orderIds.length) return orders;

  const admin = createAdminClient();
  const { data: orderItems } = await admin
    .from("order_items")
    .select("id,order_id,product_id,name,quantity,unit_price,notes")
    .in("order_id", orderIds);

  if (!orderItems?.length) return orders;

  const productIds = Array.from(
    new Set(
      orderItems
        .map((item) => item.product_id)
        .filter(Boolean)
        .map(String),
    ),
  );
  const productsById = new Map<string, Record<string, unknown>>();
  const categoryIds = new Set<string>();

  if (productIds.length) {
    const { data: products } = await admin
      .from("menu_products")
      .select("id,category_id,legacy_category")
      .in("id", productIds)
      .eq("cafe_id", cafeId);

    for (const product of products ?? []) {
      productsById.set(String(product.id), product as Record<string, unknown>);
      if (product.category_id) categoryIds.add(String(product.category_id));
    }
  }

  const categoriesById = new Map<string, string>();
  if (categoryIds.size) {
    const { data: categories } = await admin
      .from("menu_categories")
      .select("id,name")
      .in("id", Array.from(categoryIds))
      .eq("cafe_id", cafeId);

    for (const category of categories ?? []) {
      categoriesById.set(String(category.id), String(category.name ?? ""));
    }
  }

  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  for (const item of orderItems) {
    const product = item.product_id
      ? productsById.get(String(item.product_id))
      : undefined;
    const categoryId = product?.category_id ? String(product.category_id) : "";
    const categoryName =
      (categoryId ? categoriesById.get(categoryId) : undefined) ??
      (product?.legacy_category ? String(product.legacy_category) : "");
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? 0);
    const mapped = {
      id: String(item.id),
      productId: item.product_id ? String(item.product_id) : "",
      product_id: item.product_id ? String(item.product_id) : "",
      name: String(item.name ?? ""),
      categoryName,
      category_name: categoryName,
      quantity,
      qty: quantity,
      unitPrice,
      unit_price: unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
      notes: item.notes ? String(item.notes) : "",
    };
    const orderId = String(item.order_id);
    const list = itemsByOrder.get(orderId) ?? [];
    list.push(mapped);
    itemsByOrder.set(orderId, list);
  }

  return orders.map((order) => {
    const orderId = orderIdOf(order);
    const items = itemsByOrder.get(orderId) ?? [];
    return items.length ? { ...order, items, order_items: items } : order;
  });
}

function firstNestedRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
}

async function getCashierOperationData(cafeId: string) {
  const admin = createAdminClient();
  const [{ data: orders }, { data: reservations }, { data: tickets }, { data: rewards }] =
    await Promise.all([
      admin
        .from("orders")
        .select("*")
        .eq("cafe_id", cafeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("reservations")
        .select("*, customer_profiles(email)")
        .eq("cafe_id", cafeId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("event_tickets")
        .select("*, customer_profiles(full_name,phone,email), menu_products(name)")
        .eq("cafe_id", cafeId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("experience_reward_submissions")
        .select("*, experience_reward_items(*), customer_profiles!experience_rewards_customer_same_cafe(full_name,phone,email)")
        .eq("cafe_id", cafeId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  const operationOrders = await attachOrderItems((orders ?? []) as Array<Record<string, unknown>>, cafeId);
  const operationReservations = ((reservations ?? []) as Array<Record<string, unknown>>).map((reservation) => {
    const profile = firstNestedRecord(reservation.customer_profiles);
    return {
      ...reservation,
      customerEmail: profile?.email ? String(profile.email) : "",
      customer_email: profile?.email ? String(profile.email) : "",
    };
  });
  const operationTickets = ((tickets ?? []) as Array<Record<string, unknown>>).map((ticket) => {
    const profile = firstNestedRecord(ticket.customer_profiles);
    const product = firstNestedRecord(ticket.menu_products);
    return {
      ...ticket,
      customerName: profile?.full_name ? String(profile.full_name) : "",
      customer_name: profile?.full_name ? String(profile.full_name) : "",
      customerPhone: profile?.phone ? String(profile.phone) : "",
      customer_phone: profile?.phone ? String(profile.phone) : "",
      customerEmail: profile?.email ? String(profile.email) : "",
      customer_email: profile?.email ? String(profile.email) : "",
      ticketName: product?.name ? String(product.name) : "",
      ticket_name: product?.name ? String(product.name) : "",
    };
  });
  const operationRewards = ((rewards ?? []) as Array<Record<string, unknown>>).map((reward) => {
    const profile = firstNestedRecord(reward.customer_profiles);
    return {
      ...reward,
      customerName: profile?.full_name ? String(profile.full_name) : "",
      customer_name: profile?.full_name ? String(profile.full_name) : "",
      customerPhone: profile?.phone ? String(profile.phone) : "",
      customer_phone: profile?.phone ? String(profile.phone) : "",
      customerEmail: profile?.email ? String(profile.email) : "",
      customer_email: profile?.email ? String(profile.email) : "",
      items: reward.experience_reward_items,
    };
  });

  return {
    operationOrders,
    operationReservations,
    operationTickets,
    operationRewards,
  };
}

async function recordCashierConsoleEntry(input: {
  cafeId: string;
  cafeSlug: string;
  cashierId: string;
  cashierName: string;
  cashierEmail: string;
}) {
  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from("cafe_cashier_activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("cafe_id", input.cafeId)
    .eq("cashier_id", input.cashierId)
    .eq("action_type", "login")
    .gte("created_at", windowStart);

  if (!count) {
    await admin
      .from("cafe_cashier_activity_logs")
      .insert({
        cafe_id: input.cafeId,
        cashier_id: input.cashierId,
        action_type: "login",
        target_type: "cashier_session",
        target_id: input.cashierId,
        details: {
          source: "cashier_console_entry",
          cashierName: input.cashierName,
          email: input.cashierEmail,
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[recordCashierConsoleEntry:activity]", error.message);
      });
  }

  await recordOperationEvent({
    cafeId: input.cafeId,
    eventType: operationEventTypes.cashierLogin,
    actorType: "cashier",
    actorId: input.cashierId,
    actorName: input.cashierName,
    actorEmail: input.cashierEmail,
    entityType: "cashier_session",
    metadata: {
      cafeSlug: input.cafeSlug,
      source: "cashier_console_entry",
    },
  });
}

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

  const admin = createAdminClient();
  const cashierId = String(data[0].cashier_id);
  const cafeId = String(data[0].cafe_id);
  const loginWindowStart = new Date(Date.now() - 10_000).toISOString();
  const { count: recentLoginCount } = await admin
    .from("cafe_cashier_activity_logs")
    .select("id", { count: "exact", head: true })
    .eq("cafe_id", cafeId)
    .eq("cashier_id", cashierId)
    .eq("action_type", "login")
    .gte("created_at", loginWindowStart);

  if (!recentLoginCount) {
    await admin
      .from("cafe_cashier_activity_logs")
      .insert({
        cafe_id: cafeId,
        cashier_id: cashierId,
        action_type: "login",
        target_type: "cashier_session",
        target_id: cashierId,
        details: {
          email: email.trim().toLowerCase(),
          cashierName: String(data[0].cashier_name),
          source: "server_login_fallback",
        },
      })
      .then(({ error }) => {
        if (error) console.warn("[loginCashierWithPassword:activity]", error.message);
      });
  }

  await recordOperationEvent({
    cafeId,
    eventType: operationEventTypes.cashierLogin,
    actorType: "cashier",
    actorId: cashierId,
    actorName: String(data[0].cashier_name),
    actorEmail: email.trim().toLowerCase(),
    entityType: "cashier_session",
    metadata: {
      cafeSlug: String(data[0].cafe_slug),
      source: "cashier_login",
    },
  });

  return {
    token,
    cafeId,
    cashierId,
    cashierName: String(data[0].cashier_name),
    cafeName: String(data[0].cafe_name),
    cafeSlug: String(data[0].cafe_slug),
  };
}

export async function getCashierToken() {
  const store = await cookies();
  return store.get(cashierSessionCookie)?.value ?? null;
}

type CashierSessionContext = {
  token: string;
  cafeId: string;
  cashierId: string;
  cashierName: string;
  cashierEmail: string;
  cafeName: string;
  cafeSlug: string;
  businessCategory: string;
};

function firstRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
}

function shortCashierOrderCode(orderId: string) {
  return orderId ? orderId.slice(0, 8).toUpperCase() : "-";
}

function cashierReservationDateTime(row: Record<string, unknown>) {
  return [row.reservation_date, row.reservation_time]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ") || "-";
}

async function cashierOrderDisplayName(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
) {
  const { data: items } = await admin
    .from("order_items")
    .select("name,quantity")
    .eq("order_id", orderId);
  if (!items?.length) return "طلب";
  const firstName = String(items[0]?.name ?? "طلب");
  return items.length > 1 ? `${firstName} + ${items.length - 1}` : firstName;
}

async function requireCashierSessionContext(
  admin = createAdminClient(),
): Promise<CashierSessionContext> {
  const token = await getCashierToken();
  if (!token) throw new Error("Cashier session expired");

  const { data: session, error } = await admin
    .from("cafe_cashier_sessions")
    .select("id,cafe_id,cashier_id,expires_at,revoked_at,cafe_cashiers!cashier_sessions_cashier_same_cafe(full_name,email,employee_number),cafes(name,slug,business_category)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!session || session.revoked_at) throw new Error("Cashier session expired");

  const cashier = firstRecord(session.cafe_cashiers);
  const cafe = firstRecord(session.cafes);

  return {
    token,
    cafeId: String(session.cafe_id),
    cashierId: String(session.cashier_id),
    cashierName: String(cashier?.full_name ?? "Cashier"),
    cashierEmail: String(cashier?.email ?? ""),
    cafeName: String(cafe?.name ?? "Barndaksa"),
    cafeSlug: String(cafe?.slug ?? ""),
    businessCategory: String(cafe?.business_category ?? "cafes_coffee"),
  };
}

async function writeCashierAudit(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    session: CashierSessionContext;
    action: string;
    entityTable: string;
    entityId: string;
    oldData?: Record<string, unknown>;
    newData?: Record<string, unknown>;
  },
) {
  await admin.from("audit_logs").insert({
    cafe_id: input.session.cafeId,
    action: input.action,
    entity_table: input.entityTable,
    entity_id: input.entityId,
    old_data: input.oldData ?? null,
    new_data: {
      ...(input.newData ?? {}),
      actorSource: "cashier",
      cashierId: input.session.cashierId,
      cashierName: input.session.cashierName,
    },
  });
}

async function writeCashierActivity(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    session: CashierSessionContext;
    actionType: "order_received" | "reservation_received" | "loyalty_stamp";
    targetType: string;
    targetId: string;
    invoiceBarcode?: string;
    details?: Record<string, unknown>;
  },
) {
  await admin.from("cafe_cashier_activity_logs").insert({
    cafe_id: input.session.cafeId,
    cashier_id: input.session.cashierId,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId,
    invoice_barcode: input.invoiceBarcode ?? null,
    details: {
      source: "cashier_console",
      cashierName: input.session.cashierName,
      ...(input.details ?? {}),
    },
  });
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
  await recordCashierConsoleEntry({
    cafeId: normalized.cafe.id,
    cafeSlug: normalized.cafe.slug,
    cashierId: normalized.cashier.id,
    cashierName: normalized.cashier.fullName,
    cashierEmail: normalized.cashier.email,
  }).catch((error) => console.warn("[getCashierConsole:entry]", error));
  const admin = createAdminClient();
  const [{ data: cafe }, { data: loyaltyProgram }] = await Promise.all([
    admin
      .from("cafes")
      .select("business_category")
      .eq("id", normalized.cafe.id)
      .maybeSingle(),
    admin
      .from("cafe_loyalty_programs")
      .select("enabled")
      .eq("cafe_id", normalized.cafe.id)
      .maybeSingle(),
  ]);
  const cafeWithCategory = {
    ...normalized.cafe,
    businessCategory: cafe?.business_category ?? normalized.cafe.businessCategory ?? "cafes_coffee",
    loyaltyCardEnabled: loyaltyProgram ? Boolean(loyaltyProgram.enabled) : true,
  };
  const enriched = await enrichCashierOrdersWithItems({
    ...normalized,
    cafe: cafeWithCategory,
  });
  const operationData = await getCashierOperationData(cafeWithCategory.id);
  return {
    ...enriched,
    ...operationData,
    cafe: cafeWithCategory,
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
  return cashierUpdateOrderStatus(orderId, "accepted");
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
  return cashierUpdateReservationStatus(reservationId, "accepted");
  const token = await getCashierToken();
  if (!token) throw new Error("جلسة الكاشير منتهية");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cashier_accept_reservation", {
    p_session_token: token,
    p_reservation_id: reservationId,
  });
  if (error) throw error;
}

export async function cashierUpdateOrderStatus(
  orderId: string,
  status: "accepted" | "rejected",
  rejectionReason?: string,
) {
  const admin = createAdminClient();
  const session = await requireCashierSessionContext(admin);
  const reason = rejectionReason?.trim() ?? "";

  if (!orderId) throw new Error("Order id is required");
  if (status === "rejected" && !reason) throw new Error("Rejection reason is required");

  const { data: order, error: lookupError } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!order || String(order.cafe_id) !== session.cafeId) {
    throw new Error("Order does not belong to this cashier cafe");
  }
  if (String(order.status) !== "pending_cafe") {
    throw new Error("Order status no longer allows this action");
  }

  const now = new Date().toISOString();
  const { data: updatedOrder, error: updateError } = await admin
    .from("orders")
    .update({
      status,
      rejection_reason: status === "rejected" ? reason : null,
      responded_at: now,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("cafe_id", session.cafeId)
    .eq("status", "pending_cafe")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedOrder) throw new Error("Order was updated before this action completed");

  await writeCashierActivity(admin, {
    session,
    actionType: "order_received",
    targetType: "order",
    targetId: orderId,
    details: {
      action: status,
      statusBefore: String(order.status),
      statusAfter: status,
      rejectionReason: status === "rejected" ? reason : null,
      customerName: String(order.customer_name ?? ""),
      total: Number(order.total ?? 0),
    },
  }).catch(() => undefined);

  await writeCashierAudit(admin, {
    session,
    action: "cashier_update_order_status",
    entityTable: "orders",
    entityId: orderId,
    oldData: order as Record<string, unknown>,
    newData: {
      status,
      rejectionReason: status === "rejected" ? reason : null,
    },
  }).catch(() => undefined);

  await recordOperationEvent({
    cafeId: session.cafeId,
    eventType: status === "accepted" ? operationEventTypes.orderAccepted : operationEventTypes.orderRejected,
    actorType: "cashier",
    actorId: session.cashierId,
    actorName: session.cashierName,
    actorEmail: session.cashierEmail,
    entityType: "order",
    entityId: orderId,
    metadata: {
      status,
      rejectionReason: status === "rejected" ? reason : null,
      customerName: String(order.customer_name ?? ""),
      total: Number(order.total ?? 0),
    },
  });

  if (order.customer_id && session.cafeSlug) {
    await createNotification({
      cafeSlug: session.cafeSlug,
      audience: "customer",
      customerId: String(order.customer_id),
      title: status === "accepted" ? "تم قبول طلبك" : "تم رفض طلبك",
      body:
        status === "accepted"
          ? `تم قبول طلبك من ${session.cafeName}.`
          : `تم رفض طلبك من ${session.cafeName}. السبب: ${reason}`,
      type: status === "accepted" ? "order_accepted" : "order_rejected",
      meta: {
        orderId,
        status,
        actorSource: "cashier",
        cashierName: session.cashierName,
      },
    }).catch(() => undefined);
  }

  const customerPhone = order.customer_phone ? String(order.customer_phone) : "";
  if (customerPhone) {
    const orderName = await cashierOrderDisplayName(admin, orderId);
    const isEventCafe = session.businessCategory === "events_conferences";
    const body =
      status === "accepted"
        ? isEventCafe
          ? `تم تأكيد تذكرتك لدى ${session.cafeName}\nالتذكرة: ${orderName}\nرقم التذكرة: ${shortCashierOrderCode(orderId)}`
          : `تم قبول طلبك من ${session.cafeName}\nالطلب: ${orderName}\nرقم الطلب: ${shortCashierOrderCode(orderId)}`
        : `تم رفض طلبك من ${session.cafeName}\nالطلب: ${orderName}${
            reason ? `\nالسبب إن وجد: ${reason}` : ""
          }`;

    await sendWhatsAppMessage({
      to: customerPhone,
      body,
      eventType:
        status === "accepted" && isEventCafe
          ? "event_ticket_order_accepted"
          : status === "accepted"
            ? "order_accepted"
            : "order_rejected",
      cafeId: session.cafeId,
      recipientName: order.customer_name ? String(order.customer_name) : undefined,
    }).catch(() => undefined);
  }

  return { ok: true as const, order: updatedOrder };
}

export async function cashierUpdateReservationStatus(
  reservationId: string,
  status: "accepted" | "rejected" | "modification_requested",
  message?: string,
) {
  const admin = createAdminClient();
  const session = await requireCashierSessionContext(admin);
  const cleanMessage = message?.trim() ?? "";

  if (!reservationId) throw new Error("Reservation id is required");
  if (status !== "accepted" && !cleanMessage) {
    throw new Error(status === "rejected" ? "Rejection reason is required" : "Alternative time is required");
  }
  if (cleanMessage.length > 500) throw new Error("Message is too long");

  const { data: reservation, error: lookupError } = await admin
    .from("reservations")
    .select("*")
    .eq("id", reservationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!reservation || String(reservation.cafe_id) !== session.cafeId) {
    throw new Error("Reservation does not belong to this cashier cafe");
  }
  if (String(reservation.status) !== "pending") {
    throw new Error("Reservation status no longer allows this action");
  }

  const { data: updatedReservation, error: updateError } = await admin
    .from("reservations")
    .update({
      status,
      cafe_message: status === "rejected" ? null : cleanMessage || null,
      rejection_reason: status === "rejected" ? cleanMessage || "تم رفض الحجز" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("cafe_id", session.cafeId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedReservation) throw new Error("Reservation was updated before this action completed");

  await writeCashierActivity(admin, {
    session,
    actionType: "reservation_received",
    targetType: "reservation",
    targetId: reservationId,
    details: {
      action: status,
      statusBefore: String(reservation.status),
      statusAfter: status,
      message: cleanMessage || null,
      customerName: String(reservation.customer_name ?? ""),
      eventType: String(reservation.event_type ?? ""),
      reservationDate: String(reservation.reservation_date ?? ""),
      reservationTime: String(reservation.reservation_time ?? ""),
    },
  }).catch(() => undefined);

  await writeCashierAudit(admin, {
    session,
    action: "cashier_update_reservation_status",
    entityTable: "reservations",
    entityId: reservationId,
    oldData: reservation as Record<string, unknown>,
    newData: { status, message: cleanMessage || null },
  }).catch(() => undefined);

  await recordOperationEvent({
    cafeId: session.cafeId,
    eventType:
      status === "accepted"
        ? operationEventTypes.reservationAccepted
        : status === "rejected"
          ? operationEventTypes.reservationRejected
          : operationEventTypes.reservationModificationRequested,
    actorType: "cashier",
    actorId: session.cashierId,
    actorName: session.cashierName,
    actorEmail: session.cashierEmail,
    entityType: "reservation",
    entityId: reservationId,
    metadata: {
      status,
      message: cleanMessage || null,
      customerName: String(reservation.customer_name ?? ""),
      eventType: String(reservation.event_type ?? ""),
      reservationDate: String(reservation.reservation_date ?? ""),
      reservationTime: String(reservation.reservation_time ?? ""),
    },
  });

  if (reservation.customer_id && session.cafeSlug) {
    await createNotification({
      cafeSlug: session.cafeSlug,
      audience: "customer",
      customerId: String(reservation.customer_id),
      title:
        status === "accepted"
          ? "تم قبول حجزك"
          : status === "rejected"
            ? "تم رفض حجزك"
            : "اقتراح وقت بديل لحجزك",
      body: cleanMessage || `تم تحديث حالة حجزك في ${session.cafeName}.`,
      type: status === "accepted" ? "reservation_accepted" : "reservation_rejected",
      meta: {
        reservationId,
        status,
        message: cleanMessage,
        actorSource: "cashier",
        cashierName: session.cashierName,
      },
    }).catch(() => undefined);
  }

  const customerPhone = String(
    reservation.customer_phone ?? reservation.phone ?? "",
  ).trim();
  if (customerPhone) {
    const reservationCode = String(
      reservation.reservation_code ?? reservationId.slice(0, 8).toUpperCase(),
    );
    const body =
      status === "accepted"
        ? `تم تأكيد حجزك لدى ${session.cafeName}\nالموعد: ${cashierReservationDateTime(
            reservation as Record<string, unknown>,
          )}\nرقم الحجز: ${reservationCode}`
        : status === "rejected"
          ? `تم رفض حجزك لدى ${session.cafeName}${
              cleanMessage ? `\nالسبب إن وجد: ${cleanMessage}` : ""
            }`
          : `لدى ${session.cafeName} اقتراح وقت بديل لحجزك\nالوقت المقترح: ${
              cleanMessage || "-"
            }\nرقم الحجز: ${reservationCode}`;

    await sendWhatsAppMessage({
      to: customerPhone,
      body,
      eventType:
        status === "accepted"
          ? "reservation_accepted"
          : status === "rejected"
            ? "reservation_rejected"
            : "reservation_alternative_time",
      cafeId: session.cafeId,
      recipientName: reservation.customer_name
        ? String(reservation.customer_name)
        : undefined,
    }).catch(() => undefined);
  }

  return { ok: true as const, reservation: updatedReservation };
}

export async function cashierConfirmEventTicket(codeInput: string) {
  const admin = createAdminClient();
  const session = await requireCashierSessionContext(admin);
  const code =
    parseBarndaksaQrPayload(codeInput, "event-ticket") ??
    codeInput.trim().toUpperCase();

  if (!code) throw new Error("Ticket code is required");

  const { data: ticket, error: lookupError } = await admin
    .from("event_tickets")
    .select("*, customer_profiles(full_name,phone,email), menu_products(name)")
    .eq("cafe_id", session.cafeId)
    .eq("ticket_code", code)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!ticket) throw new Error("Ticket does not belong to this cashier cafe");

  const ticketStatus = String(ticket.status ?? "");
  if (ticketStatus === "used" || ticket.used_at) throw new Error("Ticket already used");
  if (ticketStatus === "cancelled") throw new Error("Ticket is cancelled");
  if (ticketStatus === "expired") throw new Error("Ticket is expired");
  if (ticketStatus !== "valid") throw new Error("Ticket is not valid");

  const now = new Date();
  if (ticket.valid_from && new Date(String(ticket.valid_from)) > now) {
    throw new Error("Ticket is not valid yet");
  }
  if (ticket.valid_until && new Date(String(ticket.valid_until)) < now) {
    await admin
      .from("event_tickets")
      .update({ status: "expired", updated_at: now.toISOString() })
      .eq("id", String(ticket.id))
      .eq("cafe_id", session.cafeId)
      .eq("status", "valid");
    throw new Error("Ticket is expired");
  }

  const currentScanCount = Number(ticket.scan_count ?? 0);
  const maxScanCount = Math.max(1, Number(ticket.max_scan_count ?? 1));
  if (currentScanCount >= maxScanCount) throw new Error("Ticket already used");

  const nextScanCount = currentScanCount + 1;
  const shouldCloseTicket = nextScanCount >= maxScanCount;
  const { data: ticketSettings } = ticket.product_id
    ? await admin
        .from("event_ticket_settings")
        .select("gate_name")
        .eq("product_id", String(ticket.product_id))
        .eq("cafe_id", session.cafeId)
        .maybeSingle()
    : { data: null };
  const gateName = String(ticketSettings?.gate_name ?? "بوابة الدخول");
  const usedAt = now.toISOString();

  const { data: updatedTicket, error: updateError } = await admin
    .from("event_tickets")
    .update({
      status: shouldCloseTicket ? "used" : "valid",
      scan_count: nextScanCount,
      used_at: shouldCloseTicket ? usedAt : ticket.used_at ?? null,
      used_by_cashier_id: session.cashierId,
      used_gate_name: gateName,
      updated_at: usedAt,
    })
    .eq("id", String(ticket.id))
    .eq("cafe_id", session.cafeId)
    .eq("status", "valid")
    .eq("scan_count", currentScanCount)
    .select("*, customer_profiles(full_name,phone,email), menu_products(name)")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedTicket) throw new Error("Ticket was updated from another device");

  const customer = firstRecord(updatedTicket.customer_profiles);
  const product = firstRecord(updatedTicket.menu_products);
  const ticketId = String(updatedTicket.id);

  await writeCashierActivity(admin, {
    session,
    actionType: "reservation_received",
    targetType: "event_ticket",
    targetId: ticketId,
    invoiceBarcode: code,
    details: {
      action: "ticket_checkin",
      ticketCode: code,
      statusAfter: String(updatedTicket.status ?? ""),
      scanCount: nextScanCount,
      maxScanCount,
      customerName: String(customer?.full_name ?? ""),
      ticketName: String(product?.name ?? ""),
      gateName,
    },
  }).catch(() => undefined);

  await writeCashierAudit(admin, {
    session,
    action: "cashier_confirm_event_ticket",
    entityTable: "event_tickets",
    entityId: ticketId,
    oldData: ticket as Record<string, unknown>,
    newData: {
      status: String(updatedTicket.status ?? ""),
      scanCount: nextScanCount,
      gateName,
    },
  }).catch(() => undefined);

  const customerPhone = customer?.phone ? String(customer.phone) : "";
  const ticketName = String(product?.name ?? "تذكرة");
  const ticketCode = String(updatedTicket.ticket_code ?? code);
  if (customerPhone) {
    await sendWhatsAppMessage({
      to: customerPhone,
      body: `تم تأكيد تذكرتك لدى ${session.cafeName}\nالتذكرة: ${ticketName}\nرقم التذكرة: ${ticketCode}`,
      eventType: "event_ticket_confirmed",
      cafeId: session.cafeId,
      recipientName: customer?.full_name ? String(customer.full_name) : undefined,
    }).catch(() => undefined);
  }

  return {
    ok: true as const,
    ticketId,
    ticketCode,
    customerName: String(customer?.full_name ?? "عميل"),
    customerPhone: String(customer?.phone ?? ""),
    customerEmail: String(customer?.email ?? ""),
    ticketName: String(product?.name ?? "تذكرة"),
    status: shouldCloseTicket ? "used" : "valid",
    scanCount: nextScanCount,
    maxScanCount,
    gateName,
    usedAt,
  };
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
    .select("cafe_id,cashier_id,revoked_at,expires_at,cafe_cashiers!cashier_sessions_cashier_same_cafe(full_name,email)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || session.revoked_at) throw new Error("جلسة الكاشير منتهية");
  const cashier = firstRecord(session.cafe_cashiers);

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
  const operationResult = Array.isArray(data) ? data[0] : data;
  await recordOperationEvent({
    cafeId: currentCafeId,
    eventType: operationEventTypes.loyaltyScan,
    actorType: "cashier",
    actorId: String((session as Record<string, unknown>).cashier_id ?? ""),
    actorName: String(cashier?.full_name ?? ""),
    actorEmail: String(cashier?.email ?? ""),
    entityType: "loyalty_card",
    entityId: scannedCard?.id ? String(scannedCard.id) : null,
    metadata: {
      cardCode: normalizedCardCode,
      invoiceBarcode: normalizedInvoiceBarcode,
      invoiceAmount: input.invoiceAmount ?? 0,
      operation: input.operation ?? "stamp",
      result: operationResult ?? null,
    },
  });
  return data as Record<string, unknown>;
}
