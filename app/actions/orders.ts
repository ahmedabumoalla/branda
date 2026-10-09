"use server";

import { requireStorefrontEnabled } from "@/lib/platform/storefront-availability";

import { getOwnerOrders, updateOrderStatus, createPickupOrder } from "@/lib/data/orders";
import type { OrderStatus } from "@/lib/mock/orders";
import {
  acceptPickupOrder,
  createCafeOrderFromProduct,
  getCafeOrderFailureCode,
  getCafeOrderFailureMessage,
  rejectPickupOrder,
  type CafeOrderFailureCode,
  type CreateOrderInput,
} from "@/lib/platform/order-flow";

type CafeOrderActionResult =
  | {
      ok: true;
      order: Awaited<ReturnType<typeof createCafeOrderFromProduct>>;
    }
  | {
      ok: false;
      code: CafeOrderFailureCode;
      message: string;
    };

function logCreateCafeOrderAction(
  stage: string,
  input: CreateOrderInput,
  details?: {
    resolvedCustomerId?: string | null;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  const payload = {
    stage,
    cafeSlug: input.slug,
    productId: input.product?.id ?? null,
    hasCustomerSession: Boolean(input.customer?.id),
    resolvedCustomerId: details?.resolvedCustomerId ?? null,
    ...(details?.errorCode
      ? {
          errorCode: details.errorCode,
          errorMessage: details.errorMessage ?? "",
        }
      : {}),
  };

  if (details?.errorCode) {
    console.error("[createCafeOrderAction]", payload);
  } else {
    console.info("[createCafeOrderAction]", payload);
  }
}

function safeActionErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export async function fetchOwnerOrdersAction() {
  requireStorefrontEnabled();
  return getOwnerOrders();
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
  rejectionReason?: string
) {
  requireStorefrontEnabled();
  await updateOrderStatus(orderId, status, rejectionReason);
}

export async function createCafeOrderAction(
  input: CreateOrderInput,
): Promise<CafeOrderActionResult> {
  requireStorefrontEnabled();
  logCreateCafeOrderAction("action:start", input);

  try {
    const order = await createCafeOrderFromProduct(input);
    logCreateCafeOrderAction("action:success", input, {
      resolvedCustomerId: order.customerId,
    });
    return { ok: true, order };
  } catch (error) {
    const code = getCafeOrderFailureCode(error);
    logCreateCafeOrderAction("action:failed", input, {
      resolvedCustomerId: null,
      errorCode: code,
      errorMessage: safeActionErrorMessage(error),
    });

    return {
      ok: false,
      code,
      message: getCafeOrderFailureMessage(code),
    };
  }
}

export async function acceptPickupOrderAction(orderId: string, cafeSlug?: string) {
  requireStorefrontEnabled();
  return acceptPickupOrder(orderId, cafeSlug);
}

export async function rejectPickupOrderAction(
  orderId: string,
  reason: string,
  cafeSlug?: string
) {
  requireStorefrontEnabled();
  return rejectPickupOrder(orderId, reason, cafeSlug);
}

export async function createPickupOrderAction(
  input: Parameters<typeof createPickupOrder>[0]
) {
  requireStorefrontEnabled();
  return createPickupOrder(input);
}
