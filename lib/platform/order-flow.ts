import type { MenuProduct } from "@/lib/mock/menu";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import { createPickupOrder, updateOrderStatus } from "@/lib/data/orders";
import { createNotification } from "@/lib/data/notifications";

export type CreateOrderInput = {
  slug: string;
  cafeId?: string;
  cafeName?: string;
  customer: BarndaksaCustomerSession;
  product: MenuProduct;
  quantity: number;
  branchName?: string;
  pickupAt?: string;
  notes?: string;
};

export type CreateOrderResult = {
  orderId: string;
  total: number;
  loyaltyPointsEarned: number;
};

export async function createCafeOrderFromProduct(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const { slug, customer, product, quantity } = input;

  const orderId = await createPickupOrder({
    cafeSlug: slug,
    customerId: customer.id,
    branchName: input.branchName,
    pickupAt: input.pickupAt,
    notes: input.notes,
    items: [
      {
        productId: product.id,
        quantity,
        notes: input.notes,
      },
    ],
  });

  const subtotal = product.price * quantity;
  const taxAmount = Math.round(subtotal * 0.15 * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const loyaltyPointsEarned = Math.floor(total);

  return { orderId, total, loyaltyPointsEarned };
}

export async function acceptPickupOrder(orderId: string, cafeSlug = "qatrah") {
  await updateOrderStatus(orderId, "مقبول");

  const { getOwnerOrders } = await import("@/lib/data/orders");
  const orders = await getOwnerOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false as const, error: "الطلب غير متاح للقبول" };
  }

  if (order.customerId) {
    await createNotification({
      cafeSlug: order.cafeSlug || cafeSlug,
      audience: "customer",
      customerId: order.customerId,
      title: "تم قبول طلبك",
      body: `طلبك ${orderId} مقبول. الدفع عند الاستلام في ${order.branchName || "الفرع"}.`,
      type: "order_accepted",
      meta: { orderId },
    });
  }

  return { ok: true as const, order: { ...order, status: "مقبول" as const } };
}

export async function rejectPickupOrder(
  orderId: string,
  reason: string,
  cafeSlug = "qatrah",
) {
  await updateOrderStatus(
    orderId,
    "مرفوض",
    reason.trim() || "تم الرفض من الكوفي",
  );

  const { getOwnerOrders } = await import("@/lib/data/orders");
  const orders = await getOwnerOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false as const, error: "الطلب غير متاح للرفض" };
  }

  if (order.customerId) {
    await createNotification({
      cafeSlug: order.cafeSlug || cafeSlug,
      audience: "customer",
      customerId: order.customerId,
      title: "تم رفض طلبك",
      body: `طلبك ${orderId} مرفوض. السبب: ${reason.trim() || "غير محدد"}`,
      type: "order_rejected",
      meta: { orderId },
    });
  }

  return { ok: true as const, order: { ...order, status: "مرفوض" as const } };
}
