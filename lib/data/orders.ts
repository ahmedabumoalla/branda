import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCafeBySlug, requireOwnerCafeContext } from "@/lib/data/cafes";
import { assertCustomerIdMatchesSession } from "@/lib/data/customers";
import { mapDbOrderToCafeOrder, mapOrderStatusToDb } from "@/lib/data/mappers";
import type { CafeOrder, OrderStatus } from "@/lib/mock/orders";
import {
  escapeEmailHtml,
  isBarndaksaEmailConfigured,
  sendBarndaksaEmail,
} from "@/lib/email/resend";
import { createNotification } from "@/lib/data/notifications";

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
  customerId: z.string().uuid(),
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

/** Creates order via secure RPC — prices and status computed in database only */
export async function createPickupOrder(
  input: z.infer<typeof createOrderSchema>,
) {
  const parsed = createOrderSchema.parse(input);
  await assertCustomerIdMatchesSession(parsed.cafeSlug, parsed.customerId);
  const cafe = await getCafeBySlug(parsed.cafeSlug);
  if (!cafe) throw new Error("Cafe not found");

  const supabase = await createClient();
  const rpcItems = parsed.items.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    notes: item.notes ?? null,
  }));

  const { data: orderId, error } = await supabase.rpc("create_pickup_order", {
    p_cafe_id: cafe.id,
    p_branch_name: parsed.branchName ?? null,
    p_pickup_at: parsed.pickupAt ?? null,
    p_notes: parsed.notes ?? null,
    p_items: rpcItems,
  });

  if (error) throw error;

  await createNotification({
    cafeSlug: cafe.slug,
    audience: "cafe",
    title: "طلب منيو جديد",
    body: `وصل طلب جديد من عميل للفرع ${parsed.branchName ?? "غير محدد"}`,
    type: "new_pickup_order",
    meta: { orderId: String(orderId), branchName: parsed.branchName ?? "" },
  }).catch(() => undefined);

  if (isBarndaksaEmailConfigured()) {
    try {
      const [{ data: settings }, { data: customer }] = await Promise.all([
        supabase
          .from("cafe_settings")
          .select("owner_email")
          .eq("cafe_id", cafe.id)
          .maybeSingle(),
        supabase
          .from("customer_profiles")
          .select("email, full_name")
          .eq("id", parsed.customerId)
          .maybeSingle(),
      ]);
      const ownerEmail = settings?.owner_email
        ? String(settings.owner_email)
        : undefined;
      if (ownerEmail) {
        await sendBarndaksaEmail({
          to: ownerEmail,
          subject: "طلب كوفي جديد وصل عبر برندة",
          text: `وصل طلب كوفي جديد للفرع ${parsed.branchName ?? "غير محدد"}.`,
          html: `<div dir="rtl"><h2>طلب كوفي جديد</h2><p>الفرع: ${escapeEmailHtml(parsed.branchName ?? "غير محدد")}</p><p>موعد الاستلام: ${escapeEmailHtml(parsed.pickupAt ?? "غير محدد")}</p><p>الملاحظات: ${escapeEmailHtml(parsed.notes ?? "-")}</p></div>`,
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

  return orderId as string;
}
