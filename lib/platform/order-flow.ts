import {
  CUSTOMER_KEY,
  INVOICES_KEY,
  ORDERS_KEY as CUSTOMER_ORDERS_KEY,
  TRANSACTIONS_KEY,
  type CustomerInvoice,
  type CustomerOrder,
  type CustomerProfile,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";
import type { MenuProduct } from "@/lib/mock/menu";
import {
  ORDERS_KEY,
  type CafeOrder,
  type CafeOrderItem,
} from "@/lib/mock/orders";
import {
  PLATFORM_CAFES_KEY,
  PLATFORM_CUSTOMERS_KEY,
  PLATFORM_OPERATIONS_KEY,
  mockPlatformCafes,
  mockPlatformCustomers,
  mockPlatformOperations,
  type PlatformCafe,
  type PlatformCustomer,
  type PlatformOperation,
} from "@/lib/platform/admin-data";
import type { BrandaCustomerSession } from "@/lib/customer/session";
import { notifyCafe, notifyCustomer } from "@/lib/platform/notification-flow";

const TAX_RATE = 0.15;

export type CreateOrderInput = {
  slug: string;
  cafeId?: string;
  cafeName?: string;
  customer: BrandaCustomerSession;
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

function readJson<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  return saved ? JSON.parse(saved) : fallback;
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function syncCustomerOrder(orderId: string, patch: Partial<CustomerOrder>) {
  const customerOrders = readJson<CustomerOrder[]>(CUSTOMER_ORDERS_KEY, []);
  writeJson(
    CUSTOMER_ORDERS_KEY,
    customerOrders.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
  );
}

function syncPlatformOperation(orderId: string, status: string) {
  const operations = readJson<PlatformOperation[]>(
    PLATFORM_OPERATIONS_KEY,
    mockPlatformOperations
  );
  writeJson(
    PLATFORM_OPERATIONS_KEY,
    operations.map((op) =>
      op.title.includes(orderId) ? { ...op, status } : op
    )
  );
}

export function createCafeOrderFromProduct(input: CreateOrderInput): CreateOrderResult {
  const { slug, customer, product, quantity } = input;
  const cafeId = input.cafeId || "cafe_qatrah";
  const cafeName = input.cafeName || "كوفي قطرة";

  const unitPrice = product.price;
  const subtotal = unitPrice * quantity;
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const loyaltyPointsEarned = Math.floor(total);

  const createdAt = new Date().toISOString().slice(0, 10);
  const orderId = `ORD-${Date.now()}`;

  const orderItem: CafeOrderItem = {
    id: crypto.randomUUID(),
    productId: product.id,
    name: product.name,
    quantity,
    unitPrice,
    notes: input.notes,
  };

  const cafeOrder: CafeOrder = {
    id: orderId,
    cafeSlug: slug,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    branchName: input.branchName,
    type: "استلام",
    status: "بانتظار موافقة الكوفي",
    paymentStatus: "الدفع عند الاستلام",
    pickupAt: input.pickupAt,
    notes: input.notes,
    items: [orderItem],
    subtotal,
    discountAmount: 0,
    taxAmount,
    total,
    loyaltyPointsEarned,
    createdAt,
  };

  const customerOrder: CustomerOrder = {
    id: orderId,
    cafeSlug: slug,
    customerId: customer.id,
    customerName: customer.fullName,
    status: "بانتظار موافقة الكوفي",
    items: [`${product.name} × ${quantity}`],
    total,
    createdAt,
    branchName: input.branchName,
    pickupAt: input.pickupAt,
    notes: input.notes,
  };

  const invoice: CustomerInvoice = {
    id: `INV-${Date.now()}`,
    cafeSlug: slug,
    customerId: customer.id,
    title: `طلب ${orderId} — ${product.name}`,
    amount: total,
    status: "غير مدفوعة",
    createdAt,
  };

  const operation: PlatformOperation = {
    id: crypto.randomUUID(),
    cafeId,
    cafeName,
    customerName: customer.fullName,
    type: "طلب",
    title: `طلب استلام ${orderId}: ${product.name}`,
    amount: total,
    status: "بانتظار موافقة الكوفي",
    createdAt,
  };

  const cafeOrders = readJson<CafeOrder[]>(ORDERS_KEY, []);
  writeJson(ORDERS_KEY, [cafeOrder, ...cafeOrders]);

  const customerOrders = readJson<CustomerOrder[]>(CUSTOMER_ORDERS_KEY, []);
  writeJson(CUSTOMER_ORDERS_KEY, [customerOrder, ...customerOrders]);

  const invoices = readJson<CustomerInvoice[]>(INVOICES_KEY, []);
  writeJson(INVOICES_KEY, [invoice, ...invoices]);

  const operations = readJson<PlatformOperation[]>(
    PLATFORM_OPERATIONS_KEY,
    mockPlatformOperations
  );
  writeJson(PLATFORM_OPERATIONS_KEY, [operation, ...operations]);

  const customers = readJson<PlatformCustomer[]>(
    PLATFORM_CUSTOMERS_KEY,
    mockPlatformCustomers
  );

  const exists = customers.some((c) => c.id === customer.id);
  if (!exists) {
    writeJson(PLATFORM_CUSTOMERS_KEY, [
      {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        cafeId,
        cafeName,
        status: "نشط" as const,
        totalSpent: 0,
        loyaltyPoints: 0,
        createdAt,
      },
      ...customers,
    ]);
  }

  const profiles = readJson<CustomerProfile[]>(CUSTOMER_KEY, []);
  if (!profiles.some((p) => p.id === customer.id)) {
    writeJson(CUSTOMER_KEY, [
      {
        id: customer.id,
        cafeSlug: slug,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        createdAt,
      },
      ...profiles,
    ]);
  }

  notifyCafe({
    cafeSlug: slug,
    title: "طلب استلام جديد",
    body: `${customer.fullName} طلب ${product.name} × ${quantity} — ${total} ر.س`,
    type: "new_pickup_order",
    meta: { orderId },
  });

  notifyCustomer({
    cafeSlug: slug,
    customerId: customer.id,
    title: "تم إرسال طلبك",
    body: `طلبك ${orderId} بانتظار موافقة الكوفي. الدفع عند الاستلام.`,
    type: "new_pickup_order",
    meta: { orderId },
  });

  return { orderId, total, loyaltyPointsEarned };
}

export function acceptPickupOrder(orderId: string, cafeSlug = "qatrah") {
  const cafeId = "cafe_qatrah";
  const cafeOrders = readJson<CafeOrder[]>(ORDERS_KEY, []);
  const order = cafeOrders.find((o) => o.id === orderId);
  if (!order || order.status !== "بانتظار موافقة الكوفي") {
    return { ok: false as const, error: "الطلب غير متاح للقبول" };
  }

  const responseAt = new Date().toISOString();
  const nextOrders = cafeOrders.map((o) =>
    o.id === orderId
      ? { ...o, status: "مقبول" as const, cafeResponseAt: responseAt }
      : o
  );
  writeJson(ORDERS_KEY, nextOrders);

  syncCustomerOrder(orderId, { status: "مقبول" });
  syncPlatformOperation(orderId, "مقبول");

  const transaction: CustomerTransaction = {
    id: crypto.randomUUID(),
    cafeSlug: order.cafeSlug,
    customerId: order.customerId,
    type: "طلب",
    title: `طلب ${order.items[0]?.name ?? orderId}`,
    description: `طلب استلام مقبول — الإجمالي ${order.total} ر.س`,
    amount: order.total,
    points: order.loyaltyPointsEarned,
    createdAt: responseAt.slice(0, 10),
  };

  const transactions = readJson<CustomerTransaction[]>(TRANSACTIONS_KEY, []);
  writeJson(TRANSACTIONS_KEY, [transaction, ...transactions]);

  const cafes = readJson<PlatformCafe[]>(PLATFORM_CAFES_KEY, mockPlatformCafes);
  writeJson(
    PLATFORM_CAFES_KEY,
    cafes.map((cafe) =>
      cafe.id === cafeId
        ? {
            ...cafe,
            totalRevenue: cafe.totalRevenue + order.total,
            totalOrders: cafe.totalOrders + 1,
          }
        : cafe
    )
  );

  const customers = readJson<PlatformCustomer[]>(
    PLATFORM_CUSTOMERS_KEY,
    mockPlatformCustomers
  );
  writeJson(
    PLATFORM_CUSTOMERS_KEY,
    customers.map((c) =>
      c.id === order.customerId
        ? {
            ...c,
            totalSpent: c.totalSpent + order.total,
            loyaltyPoints: c.loyaltyPoints + order.loyaltyPointsEarned,
          }
        : c
    )
  );

  notifyCustomer({
    cafeSlug,
    customerId: order.customerId,
    title: "تم قبول طلبك",
    body: `طلبك ${orderId} مقبول. الدفع عند الاستلام في ${order.branchName || "الفرع"}.`,
    type: "order_accepted",
    meta: { orderId },
  });

  return { ok: true as const, order: nextOrders.find((o) => o.id === orderId)! };
}

export function rejectPickupOrder(
  orderId: string,
  reason: string,
  cafeSlug = "qatrah"
) {
  const cafeOrders = readJson<CafeOrder[]>(ORDERS_KEY, []);
  const order = cafeOrders.find((o) => o.id === orderId);
  if (!order || order.status !== "بانتظار موافقة الكوفي") {
    return { ok: false as const, error: "الطلب غير متاح للرفض" };
  }

  const responseAt = new Date().toISOString();
  const nextOrders = cafeOrders.map((o) =>
    o.id === orderId
      ? {
          ...o,
          status: "مرفوض" as const,
          rejectionReason: reason.trim() || "تم الرفض من الكوفي",
          cafeResponseAt: responseAt,
        }
      : o
  );
  writeJson(ORDERS_KEY, nextOrders);

  syncCustomerOrder(orderId, {
    status: "مرفوض",
    rejectionReason: reason.trim() || "تم الرفض من الكوفي",
  });
  syncPlatformOperation(orderId, "مرفوض");

  const invoices = readJson<CustomerInvoice[]>(INVOICES_KEY, []);
  writeJson(
    INVOICES_KEY,
    invoices.map((inv) =>
      inv.title.includes(orderId) ? { ...inv, status: "ملغية" as const } : inv
    )
  );

  notifyCustomer({
    cafeSlug,
    customerId: order.customerId,
    title: "تم رفض طلبك",
    body: `طلبك ${orderId} مرفوض. السبب: ${reason.trim() || "غير محدد"}`,
    type: "order_rejected",
    meta: { orderId },
  });

  return { ok: true as const, order: nextOrders.find((o) => o.id === orderId)! };
}
