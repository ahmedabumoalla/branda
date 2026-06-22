"use server";

import { getOwnerOrders, updateOrderStatus, createPickupOrder } from "@/lib/data/orders";
import type { OrderStatus } from "@/lib/mock/orders";
import {
  acceptPickupOrder,
  createCafeOrderFromProduct,
  rejectPickupOrder,
  type CreateOrderInput,
} from "@/lib/platform/order-flow";

type CafeOrderActionResult =
  | {
      ok: true;
      order: Awaited<ReturnType<typeof createCafeOrderFromProduct>>;
    }
  | {
      ok: false;
      code: "login_required" | "customer_profile_not_found" | "order_failed";
      message: string;
    };

export async function fetchOwnerOrdersAction() {
  return getOwnerOrders();
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
  rejectionReason?: string
) {
  await updateOrderStatus(orderId, status, rejectionReason);
}

export async function createCafeOrderAction(
  input: CreateOrderInput,
): Promise<CafeOrderActionResult> {
  try {
    const order = await createCafeOrderFromProduct(input);
    return { ok: true, order };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Unauthorized") {
      return {
        ok: false,
        code: "login_required",
        message: "يجب تسجيل الدخول لإرسال الطلب.",
      };
    }

    if (
      message === "Customer profile not found" ||
      message.includes("Customer profile not found for this cafe")
    ) {
      return {
        ok: false,
        code: "customer_profile_not_found",
        message: "لم يتم العثور على حساب العميل لهذا المقهى.",
      };
    }

    return {
      ok: false,
      code: "order_failed",
      message: "تعذر إرسال الطلب حاول مرة أخرى.",
    };
  }
}

export async function acceptPickupOrderAction(orderId: string, cafeSlug?: string) {
  return acceptPickupOrder(orderId, cafeSlug);
}

export async function rejectPickupOrderAction(
  orderId: string,
  reason: string,
  cafeSlug?: string
) {
  return rejectPickupOrder(orderId, reason, cafeSlug);
}

export async function createPickupOrderAction(
  input: Parameters<typeof createPickupOrder>[0]
) {
  return createPickupOrder(input);
}
