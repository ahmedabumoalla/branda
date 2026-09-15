import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { operationEventTypes, recordOperationEvent } from "@/lib/data/operation-events";
import { parseBarndaksaQrPayload } from "@/lib/loyalty/secure-qr-payload";
import { createNotification } from "@/lib/data/notifications";
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
  operationOrders?: Array<Record<string, unknown>>;
  ordersError: string | null;
};

export type CashierOrdersResult =
  | { authenticated: false; orders: []; dataError: null }
  | {
      authenticated: true;
      orders: Array<Record<string, unknown>>;
      dataError: string | null;
    };

const cashierOrderStatuses = [
  "pending_cafe",
  "accepted",
  "completed",
  "not_completed",
  "rejected",
  "cancelled_by_customer",
] as const;

function orderIdOf(order: Record<string, unknown>) {
  const raw = order.id ?? order.order_id ?? order.orderId;
  return raw ? String(raw) : "";
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

export async function loginCashierWithPassword(
  email: string,
  password: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("login_cafe_cashier", {
    p_email: email.trim().toLowerCase(),
    p_password: password,
  });
  if (error || !Array.isArray(data) || !data[0]?.token) {
    console.warn("[cashier-login]", {
      stage: "login_rpc",
      reason: error?.code ?? "invalid_credentials",
    });
    return null;
  }

  const token = String(data[0].token);
  const admin = createAdminClient();
  const cashierId = String(data[0].cashier_id);
  const cafeId = String(data[0].cafe_id);
  const { data: createdSession, error: sessionError } = await admin
    .from("cafe_cashier_sessions")
    .select("id,cafe_id,cashier_id,expires_at,revoked_at")
    .eq("token", token)
    .eq("cafe_id", cafeId)
    .eq("cashier_id", cashierId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const { data: activeCashier, error: cashierError } = await admin
    .from("cafe_cashiers")
    .select("id,active")
    .eq("id", cashierId)
    .eq("cafe_id", cafeId)
    .maybeSingle();

  if (
    sessionError ||
    cashierError ||
    !createdSession ||
    createdSession.revoked_at ||
    !activeCashier?.active
  ) {
    console.warn("[cashier-login]", {
      stage: "verify_created_session",
      cashierId,
      cafeId,
      reason:
        sessionError?.code ??
        cashierError?.code ??
        (!activeCashier?.active ? "inactive_cashier" : "invalid_session"),
    });
    return null;
  }

  const store = await cookies();
  store.set(cashierSessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
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

export async function requireCashierSessionContext(
  admin = createAdminClient(),
): Promise<CashierSessionContext> {
  const token = await getCashierToken();
  if (!token) {
    console.warn("[cashier-session]", { stage: "read_cookie", hasCookie: false });
    throw new Error("Cashier session expired");
  }

  const { data: session, error } = await admin
    .from("cafe_cashier_sessions")
    .select("id,cafe_id,cashier_id,expires_at,revoked_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !session || session.revoked_at) {
    console.warn("[cashier-session]", {
      stage: "verify_session",
      hasCookie: true,
      reason: error?.code ?? (session?.revoked_at ? "revoked" : "expired_or_missing"),
    });
    throw new Error("Cashier session expired");
  }

  const [{ data: cashier, error: cashierError }, { data: cafe, error: cafeError }] =
    await Promise.all([
      admin
        .from("cafe_cashiers")
        .select("id,full_name,email,employee_number,active")
        .eq("id", String(session.cashier_id))
        .eq("cafe_id", String(session.cafe_id))
        .maybeSingle(),
      admin
        .from("cafes")
        .select("id,name,slug,business_category")
        .eq("id", String(session.cafe_id))
        .maybeSingle(),
    ]);

  if (cashierError || cafeError || !cafe) {
    console.warn("[cashier-session]", {
      stage: "load_context",
      cashierId: String(session.cashier_id),
      cafeId: String(session.cafe_id),
      reason: cashierError?.code ?? cafeError?.code ?? "missing_cafe",
    });
    throw new Error("Cashier session context is invalid");
  }
  if (!cashier || cashier.active !== true) {
    console.warn("[cashier-session]", {
      stage: "verify_cashier",
      cashierId: String(session.cashier_id),
      cafeId: String(session.cafe_id),
      reason: "inactive_cashier",
    });
    throw new Error("Cashier account is inactive");
  }

  return {
    token,
    cafeId: String(session.cafe_id),
    cashierId: String(session.cashier_id),
    cashierName: String(cashier.full_name ?? "Cashier"),
    cashierEmail: String(cashier.email ?? ""),
    cafeName: String(cafe.name ?? "Barndaksa"),
    cafeSlug: String(cafe.slug ?? ""),
    businessCategory: String(cafe.business_category ?? "cafes_coffee"),
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
    actionType: "order_received" | "loyalty_stamp";
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

async function loadCashierOrders(
  admin: ReturnType<typeof createAdminClient>,
  session: CashierSessionContext,
): Promise<{ orders: Array<Record<string, unknown>>; dataError: string | null }> {
  const { data: orderRows, error: ordersError } = await admin
    .from("orders")
    .select(
      "id,cafe_id,customer_id,customer_name,customer_phone,branch_name,fulfillment_type,status,payment_status,pickup_at,rejection_reason,responded_at,subtotal,discount_amount,tax_amount,total,notes,created_at,updated_at,not_completed_reason",
    )
    .eq("cafe_id", session.cafeId)
    .is("deleted_at", null)
    .in("status", [...cashierOrderStatuses])
    .order("created_at", { ascending: false })
    .limit(40);

  if (ordersError) {
    console.warn("[cashier-console]", {
      stage: "load_orders",
      cashierId: session.cashierId,
      cafeId: session.cafeId,
      code: ordersError.code,
      message: ordersError.message,
      details: ordersError.details,
      hint: ordersError.hint,
    });
    return {
      orders: [],
      dataError: "تعذر تحميل الطلبات. الجلسة ما زالت فعالة ويمكنك إعادة المحاولة",
    };
  }

  const orders = await attachOrderItems(
    (orderRows ?? []) as Array<Record<string, unknown>>,
    session.cafeId,
  );
  return { orders, dataError: null };
}

export async function getCashierConsole(): Promise<CashierConsole | null> {
  const admin = createAdminClient();
  const verifiedSession = await requireCashierSessionContext(admin).catch((error) => {
    console.warn("[cashier-console]", {
      stage: "session_context",
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  });
  if (!verifiedSession) return null;

  const { orders, dataError } = await loadCashierOrders(admin, verifiedSession);
  await recordCashierConsoleEntry({
    cafeId: verifiedSession.cafeId,
    cafeSlug: verifiedSession.cafeSlug,
    cashierId: verifiedSession.cashierId,
    cashierName: verifiedSession.cashierName,
    cashierEmail: verifiedSession.cashierEmail,
  }).catch((error) => console.warn("[getCashierConsole:entry]", error));

  return {
    cafe: {
      id: verifiedSession.cafeId,
      name: verifiedSession.cafeName,
      slug: verifiedSession.cafeSlug,
      businessCategory: verifiedSession.businessCategory,
    },
    cashier: {
      id: verifiedSession.cashierId,
      fullName: verifiedSession.cashierName,
      email: verifiedSession.cashierEmail,
    },
    orders,
    operationOrders: orders,
    ordersError: dataError,
  };
}

export async function getCashierOrders(): Promise<CashierOrdersResult> {
  const admin = createAdminClient();
  const session = await requireCashierSessionContext(admin).catch(() => null);
  if (!session) return { authenticated: false, orders: [], dataError: null };
  const result = await loadCashierOrders(admin, session);
  return { authenticated: true, ...result };
}

export async function hasValidCashierSession() {
  if (!(await getCashierToken())) return false;
  return Boolean(await requireCashierSessionContext().catch(() => null));
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
}

export async function cashierUpdateOrderStatus(
  orderId: string,
  status: "accepted" | "rejected" | "completed" | "not_completed",
  rejectionReason?: string,
) {
  const admin = createAdminClient();
  const session = await requireCashierSessionContext(admin);
  const reason = rejectionReason?.trim() ?? "";

  if (!orderId) throw new Error("Order id is required");
  if (status === "rejected" && !reason) throw new Error("Rejection reason is required");
  if (status === "not_completed" && !reason) throw new Error("Not completed reason is required");

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
  const currentStatus = String(order.status);
  const canHandlePending = ["pending", "pending_cafe"].includes(currentStatus) && ["accepted", "rejected"].includes(status);
  const canCloseAccepted = ["accepted", "approved"].includes(currentStatus) && ["completed", "not_completed"].includes(status);
  if (!canHandlePending && !canCloseAccepted) {
    throw new Error("Order status no longer allows this action");
  }

  const now = new Date().toISOString();
  const { data: updatedOrder, error: updateError } = await admin
    .from("orders")
    .update({
      status,
      rejection_reason: status === "rejected" ? reason : null,
      not_completed_reason: status === "not_completed" ? reason : null,
      responded_at: now,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("cafe_id", session.cafeId)
    .eq("status", currentStatus)
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
      statusBefore: currentStatus,
      statusAfter: status,
      rejectionReason: status === "rejected" ? reason : null,
      notCompletedReason: status === "not_completed" ? reason : null,
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
      notCompletedReason: status === "not_completed" ? reason : null,
    },
  }).catch(() => undefined);

  await recordOperationEvent({
    cafeId: session.cafeId,
    eventType:
      status === "accepted"
        ? operationEventTypes.orderAccepted
        : status === "completed"
          ? operationEventTypes.orderCompleted
          : status === "not_completed"
            ? operationEventTypes.orderNotCompleted
          : operationEventTypes.orderRejected,
    actorType: "cashier",
    actorId: session.cashierId,
    actorName: session.cashierName,
    actorEmail: session.cashierEmail,
    entityType: "order",
    entityId: orderId,
    metadata: {
      status,
      rejectionReason: status === "rejected" ? reason : null,
      notCompletedReason: status === "not_completed" ? reason : null,
      customerName: String(order.customer_name ?? ""),
      total: Number(order.total ?? 0),
    },
  });

  if ((status === "accepted" || status === "rejected") && order.customer_id && session.cafeSlug) {
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
  if ((status === "accepted" || status === "rejected") && customerPhone) {
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
    .select("cafe_id,cashier_id,revoked_at,expires_at,cafe_cashiers!cashier_sessions_cashier_same_cafe(full_name,email,active)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || session.revoked_at) throw new Error("جلسة الكاشير منتهية");
  const cashier = firstRecord(session.cafe_cashiers);
  if (!cashier || cashier.active !== true) throw new Error("حساب الكاشير معطل");

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
