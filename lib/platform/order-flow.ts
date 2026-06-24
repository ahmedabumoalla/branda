import type { MenuProduct } from "@/lib/mock/menu";
import type { BarndaksaCustomerSession } from "@/lib/customer/session";
import { resolveCustomerProfileForOrderSession } from "@/lib/data/customers";
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
  customerId: string;
};

export type CafeOrderFailureCode =
  | "login_required"
  | "invalid_customer_session"
  | "customer_profile_not_found"
  | "phone_verification_required"
  | "product_unavailable"
  | "database_order_failed"
  | "order_failed";

type SafeOrderLogContext = {
  cafeSlug: string;
  productId: string | null;
  hasCustomerSession: boolean;
  resolvedCustomerId: string | null;
};

function safeErrorDetails(error: unknown) {
  const details = error as {
    code?: string;
    message?: string;
    cause?: { code?: string; message?: string };
  };

  return {
    code: details?.cause?.code ?? details?.code ?? getCafeOrderFailureCode(error),
    message:
      details?.message ??
      details?.cause?.message ??
      (typeof error === "string" ? error : "Unknown error"),
  };
}

function logCafeOrderFlow(
  stage: string,
  context: SafeOrderLogContext,
  error?: unknown,
) {
  const errorDetails = error ? safeErrorDetails(error) : null;
  const payload = {
    stage,
    cafeSlug: context.cafeSlug,
    productId: context.productId,
    hasCustomerSession: context.hasCustomerSession,
    resolvedCustomerId: context.resolvedCustomerId,
    ...(errorDetails
      ? {
          errorCode: errorDetails.code,
          errorMessage: errorDetails.message,
        }
      : {}),
  };

  if (error) {
    console.error("[createCafeOrderFromProduct]", payload);
  } else {
    console.info("[createCafeOrderFromProduct]", payload);
  }
}

export function getCafeOrderFailureCode(error: unknown): CafeOrderFailureCode {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message === "Unauthorized") return "login_required";
  if (
    message === "Invalid customer session" ||
    message.includes("customer mismatch")
  ) {
    return "invalid_customer_session";
  }
  if (
    message === "Customer profile not found" ||
    message.includes("Customer profile not found for this cafe")
  ) {
    return "customer_profile_not_found";
  }
  if (message === "Phone verification required") {
    return "phone_verification_required";
  }
  if (
    message === "Cafe not found" ||
    message === "Cafe is not available" ||
    message.includes("Invalid or unavailable product for pickup")
  ) {
    return "product_unavailable";
  }
  if (message === "Database order create failed") {
    return "database_order_failed";
  }

  return "order_failed";
}

export function getCafeOrderFailureMessage(code: CafeOrderFailureCode) {
  switch (code) {
    case "login_required":
      return "يجب تسجيل الدخول لإرسال الطلب.";
    case "invalid_customer_session":
      return "جلسة العميل غير صالحة. سجّل الدخول مرة أخرى.";
    case "customer_profile_not_found":
      return "لا يوجد حساب عميل لهذه العلامة.";
    case "phone_verification_required":
      return "يرجى تأكيد رقم الجوال لاستقبال تفاصيل الطلبات والحجوزات عبر واتساب.";
    case "product_unavailable":
      return "المنتج غير متاح حاليًا.";
    case "database_order_failed":
      return "تعذر إنشاء الطلب من قاعدة البيانات.";
    default:
      return "تعذر إرسال الطلب. تحقق من البيانات وحاول مرة أخرى.";
  }
}

export async function createCafeOrderFromProduct(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const { slug, product, quantity } = input;
  const context: SafeOrderLogContext = {
    cafeSlug: slug,
    productId: product?.id ?? null,
    hasCustomerSession: Boolean(input.customer?.id),
    resolvedCustomerId: null,
  };

  logCafeOrderFlow("order_flow:start", context);

  try {
    const session = await resolveCustomerProfileForOrderSession(slug);
    context.hasCustomerSession = session.hasCustomerSession;

    if (!session.hasCustomerSession) {
      throw new Error("Unauthorized");
    }
    if (!session.profile) {
      throw new Error("Invalid customer session");
    }

    const resolvedCustomerId = String(session.profile.id ?? "");
    context.resolvedCustomerId = resolvedCustomerId || null;
    if (!resolvedCustomerId) {
      throw new Error("Customer profile not found");
    }
    if (input.customer?.id && input.customer.id !== resolvedCustomerId) {
      throw new Error("Forbidden: customer mismatch");
    }

    logCafeOrderFlow("order_flow:customer_resolved", context);

    const order = await createPickupOrder({
      cafeSlug: slug,
      customerId: resolvedCustomerId,
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

    logCafeOrderFlow("order_flow:created", context);

    return {
      ...order,
      customerId: resolvedCustomerId,
    };
  } catch (error) {
    logCafeOrderFlow("order_flow:failed", context, error);
    throw error;
  }
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
    reason.trim() || "تم الرفض من العلامة",
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
