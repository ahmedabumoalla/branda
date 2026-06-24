import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { requireCustomerProfileForOrderSession } from "@/lib/data/customers";
import { mapDbOrderToCafeOrder, mapOrderStatusToDb } from "@/lib/data/mappers";
import type { CafeOrder, OrderStatus } from "@/lib/mock/orders";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";
import { createNotification } from "@/lib/data/notifications";
import { getBusinessCopy } from "@/lib/platform/business-copy";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";

export async function getOwnerOrders(): Promise<CafeOrder[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("cafe_id", cafe.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!orders?.length) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  for (const item of items ?? []) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return orders.map((o) =>
    mapDbOrderToCafeOrder(cafe.slug, o, itemsByOrder.get(o.id) ?? []),
  );
}

function shortOrderCode(orderId: string) {
  return orderId ? orderId.slice(0, 8).toUpperCase() : "-";
}

function orderDisplayName(items?: Array<Record<string, unknown>>) {
  if (!items?.length) return "طلب";
  const firstName = String(items[0]?.name ?? "طلب");
  return items.length > 1 ? `${firstName} + ${items.length - 1}` : firstName;
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  rejectionReason?: string,
) {
  await requireOwnerCafeContext();
  const dbStatus = mapOrderStatusToDb(status);
  if (dbStatus !== "accepted" && dbStatus !== "rejected") {
    throw new Error("Invalid status for pickup response");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_pickup_order", {
    p_order_id: orderId,
    p_status: dbStatus,
    p_rejection_reason: rejectionReason ?? null,
  });

  if (error) throw error;

  const { data: whatsappOrder } = await supabase
    .from("orders")
    .select(
      "id,cafe_id,customer_id,customer_name,customer_phone,customer_email,branch_name,total,status,rejection_reason,cafes(name,slug,business_category)",
    )
    .eq("id", orderId)
    .maybeSingle();

  const { data: whatsappOrderItems } = await supabase
    .from("order_items")
    .select("name,quantity")
    .eq("order_id", orderId);

  const whatsappCafeRaw = Array.isArray(whatsappOrder?.cafes)
    ? whatsappOrder?.cafes[0]
    : whatsappOrder?.cafes;
  const whatsappCafe =
    whatsappCafeRaw && typeof whatsappCafeRaw === "object"
      ? (whatsappCafeRaw as Record<string, unknown>)
      : null;
  const whatsappCafeName = String(whatsappCafe?.name ?? "برنداكسه");
  const isEventCafe =
    String(whatsappCafe?.business_category ?? "") === "events_conferences";
  const whatsappCustomerPhone = whatsappOrder?.customer_phone
    ? String(whatsappOrder.customer_phone)
    : undefined;
  if (whatsappCustomerPhone) {
    const whatsappOrderName = orderDisplayName(whatsappOrderItems ?? undefined);
    const whatsappBody =
      dbStatus === "accepted"
        ? isEventCafe
          ? `تم تأكيد تذكرتك لدى ${whatsappCafeName}\nالتذكرة: ${whatsappOrderName}\nرقم التذكرة: ${shortOrderCode(orderId)}`
          : `تم قبول طلبك من ${whatsappCafeName}\nالطلب: ${whatsappOrderName}\nرقم الطلب: ${shortOrderCode(orderId)}`
        : `تم رفض طلبك من ${whatsappCafeName}\nالطلب: ${whatsappOrderName}${
            rejectionReason ? `\nالسبب إن وجد: ${rejectionReason}` : ""
          }`;

    await sendWhatsAppMessage({
      to: whatsappCustomerPhone,
      body: whatsappBody,
      eventType:
        dbStatus === "accepted" && isEventCafe
          ? "event_ticket_order_accepted"
          : dbStatus === "accepted"
            ? "order_accepted"
            : "order_rejected",
      cafeId: whatsappOrder?.cafe_id ? String(whatsappOrder.cafe_id) : undefined,
      recipientName: whatsappOrder?.customer_name
        ? String(whatsappOrder.customer_name)
        : undefined,
    }).catch(() => undefined);
  }

  if (isBarndaksaEmailConfigured()) {
    const { data: order } = await supabase
      .from("orders")
      .select(
        "id,cafe_id,customer_id,customer_name,customer_email,branch_name,total,status,rejection_reason,cafes(name,slug)",
      )
      .eq("id", orderId)
      .maybeSingle();

    const customerEmail = order?.customer_email
      ? String(order.customer_email)
      : undefined;
    const cafeRaw = Array.isArray(order?.cafes)
      ? order?.cafes[0]
      : order?.cafes;
    const cafe =
      cafeRaw && typeof cafeRaw === "object"
        ? (cafeRaw as Record<string, unknown>)
        : null;
    const cafeName = String(cafe?.name ?? "برندة");
    if (customerEmail) {
      await sendBarndaksaEmail({
        to: customerEmail,
        subject: status === "مقبول" ? "تم قبول طلبك" : "تم تحديث طلبك",
        text: `تم تحديث حالة طلبك إلى ${status}.`,
        html: `<div dir="rtl"><h2>تم تحديث طلبك</h2><p>العلامة: ${escapeEmailHtml(cafeName)}</p><p>الحالة: ${escapeEmailHtml(status)}</p><p>السبب/الملاحظة: ${escapeEmailHtml(rejectionReason ?? "-")}</p></div>`,
      }).catch(() => undefined);
    }
  }
}

const createOrderSchema = z.object({
  cafeSlug: z.string(),
  customerId: z.string().uuid().optional(),
  branchName: z.string().optional(),
  pickupAt: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
      notes: z.string().optional(),
    }),
  ),
});

/** Creates order with server-verified customer session and database-priced items. */
export async function createPickupOrder(
  input: z.infer<typeof createOrderSchema>,
) {
  const parsed = createOrderSchema.parse(input);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");
  if (String(cafe.status ?? "") !== "active" || cafe.is_public !== true) {
    throw new Error("Cafe is not available");
  }

  const profile = await requireCustomerProfileForOrderSession(
    parsed.cafeSlug,
    parsed.customerId,
  );
  const customerId = String(profile.id ?? "");
  if (!customerId) throw new Error("Customer profile not found");

  const branchName = parsed.branchName?.trim() || null;
  const notes = parsed.notes?.trim() || null;
  if (branchName && branchName.length > 100) throw new Error("Branch name too long");
  if (notes && notes.length > 500) throw new Error("Notes too long");
  if (!parsed.items.length) throw new Error("Order must contain at least one item");
  if (parsed.items.length > 50) throw new Error("Too many items in order");

  const supabase = createAdminClient();
  const orderItems: Array<{
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    notes: string | null;
  }> = [];
  let subtotal = 0;
  let loyaltyPointsEarned = 0;

  for (const item of parsed.items) {
    if (item.quantity <= 0 || item.quantity > 99) throw new Error("Invalid quantity");
    const itemNotes = item.notes?.trim() || null;
    if (itemNotes && itemNotes.length > 500) throw new Error("Item notes too long");

    const { data: product, error: productError } = await supabase
      .from("menu_products")
      .select("id, name, price, loyalty_points")
      .eq("id", item.productId)
      .eq("cafe_id", cafe.id)
      .eq("available", true)
      .eq("available_for_pickup", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (productError) throw productError;
    if (!product) {
      throw new Error(`Invalid or unavailable product for pickup: ${item.productId}`);
    }

    const unitPrice = Number(product.price ?? 0);
    subtotal += unitPrice * item.quantity;
    loyaltyPointsEarned += Number(product.loyalty_points ?? 0) * item.quantity;
    orderItems.push({
      product_id: String(product.id),
      name: String(product.name ?? ""),
      quantity: item.quantity,
      unit_price: unitPrice,
      notes: itemNotes,
    });
  }

  const discountAmount = 0;
  const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
  const total = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      cafe_id: cafe.id,
      customer_id: customerId,
      customer_name: String(profile.full_name ?? ""),
      customer_phone: String(profile.phone ?? ""),
      customer_email: profile.email ? String(profile.email) : null,
      branch_name: branchName,
      fulfillment_type: "pickup",
      status: "pending_cafe",
      payment_status: "pay_at_pickup",
      pickup_at: parsed.pickupAt ?? null,
      notes,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total,
      loyalty_points_earned: loyaltyPointsEarned,
    })
    .select("id")
    .single();

  if (error) {
    const dbError = new Error("Database order create failed") as Error & {
      cause?: unknown;
    };
    dbError.cause = error;
    throw dbError;
  }
  const orderId = String(order.id);

  const { error: itemsError } = await supabase.from("order_items").insert(
    orderItems.map((item) => ({
      ...item,
      order_id: orderId,
    })),
  );

  if (itemsError) {
    const dbError = new Error("Database order create failed") as Error & {
      cause?: unknown;
    };
    dbError.cause = itemsError;
    throw dbError;
  }

  if (cafe.businessCategory === "events_conferences") {
    const tickets = orderItems.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        cafe_id: cafe.id,
        customer_profile_id: customerId,
        order_id: orderId,
        product_id: item.product_id,
        status: "valid",
        valid_from: parsed.pickupAt ?? null,
      }))
    );

    if (tickets.length) {
      const { error: ticketError } = await supabase
        .from("event_tickets")
        .insert(tickets);

      if (ticketError) {
        const dbError = new Error("Database order create failed") as Error & {
          cause?: unknown;
        };
        dbError.cause = ticketError;
        throw dbError;
      }
    }
  }

  await createNotification({
    cafeSlug: cafe.slug,
    audience: "cafe",
    title: "طلب منيو جديد",
    body: `وصل طلب جديد من عميل للفرع ${parsed.branchName ?? "غير محدد"}`,
    type: "new_pickup_order",
    meta: { orderId, branchName: parsed.branchName ?? "" },
  }).catch(() => undefined);

  if (isBarndaksaEmailConfigured()) {
    try {
      const copy = getBusinessCopy(cafe.businessCategory);
      const [{ data: settings }, { data: customer }] = await Promise.all([
        supabase
          .from("cafe_settings")
          .select("owner_email")
          .eq("cafe_id", cafe.id)
          .maybeSingle(),
        supabase
          .from("customer_profiles")
          .select("email, full_name")
          .eq("id", customerId)
          .maybeSingle(),
      ]);
      const ownerEmail = settings?.owner_email
        ? String(settings.owner_email)
        : undefined;
      if (ownerEmail) {
        await sendBarndaksaEmail({
          to: ownerEmail,
          subject: `طلب ${copy.casualNoun} جديد وصل عبر برندة`,
          text: `وصل طلب ${copy.casualNoun} جديد للفرع ${parsed.branchName ?? "غير محدد"}.`,
          html: `<div dir="rtl"><h2>طلب ${escapeEmailHtml(copy.casualNoun)} جديد</h2><p>الفرع: ${escapeEmailHtml(parsed.branchName ?? "غير محدد")}</p><p>موعد الاستلام: ${escapeEmailHtml(parsed.pickupAt ?? "غير محدد")}</p><p>الملاحظات: ${escapeEmailHtml(parsed.notes ?? "-")}</p></div>`,
        });
      }
      const customerEmail = customer?.email
        ? String(customer.email)
        : undefined;
      if (customerEmail) {
        await sendBarndaksaEmail({
          to: customerEmail,
          subject: "تم استلام طلبك عبر برندة",
          text: `تم استلام طلبك لدى ${cafe.name}.`,
          html: `<div dir="rtl"><h2>تم استلام طلبك</h2><p>العلامة: ${escapeEmailHtml(cafe.name)}</p><p>الفرع: ${escapeEmailHtml(parsed.branchName ?? "غير محدد")}</p><p>موعد الاستلام: ${escapeEmailHtml(parsed.pickupAt ?? "غير محدد")}</p></div>`,
        });
      }
    } catch (emailError) {
      console.warn("Pickup order email skipped", emailError);
    }
  }

  return { orderId, total, loyaltyPointsEarned };
}
