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

const TAX_RATE = 0.15;

export type CreateOrderInput = {
  slug: string;
  cafeId?: string;
  cafeName?: string;
  customer: BrandaCustomerSession;
  product: MenuProduct;
  quantity: number;
  branchName?: string;
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
  };

  const cafeOrder: CafeOrder = {
    id: orderId,
    cafeSlug: slug,
    customerId: customer.id,
    customerName: customer.fullName,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    branchName: input.branchName,
    type: "داخل الكوفي",
    status: "جديد",
    paymentStatus: "مدفوع",
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
    status: "جديد",
    items: [`${product.name} × ${quantity}`],
    total,
    createdAt,
  };

  const invoice: CustomerInvoice = {
    id: `INV-${Date.now()}`,
    cafeSlug: slug,
    customerId: customer.id,
    title: `طلب ${product.name}`,
    amount: total,
    status: "مدفوعة",
    createdAt,
  };

  const transaction: CustomerTransaction = {
    id: crypto.randomUUID(),
    cafeSlug: slug,
    customerId: customer.id,
    type: "طلب",
    title: `طلب ${product.name}`,
    description: `${quantity} × ${product.name} — الإجمالي ${total} ر.س`,
    amount: total,
    points: loyaltyPointsEarned,
    createdAt,
  };

  const operation: PlatformOperation = {
    id: crypto.randomUUID(),
    cafeId,
    cafeName,
    customerName: customer.fullName,
    type: "طلب",
    title: `طلب جديد: ${product.name}`,
    amount: total,
    status: "جديد",
    createdAt,
  };

  const cafeOrders = readJson<CafeOrder[]>(ORDERS_KEY, []);
  writeJson(ORDERS_KEY, [cafeOrder, ...cafeOrders]);

  const customerOrders = readJson<CustomerOrder[]>(CUSTOMER_ORDERS_KEY, []);
  writeJson(CUSTOMER_ORDERS_KEY, [customerOrder, ...customerOrders]);

  const invoices = readJson<CustomerInvoice[]>(INVOICES_KEY, []);
  writeJson(INVOICES_KEY, [invoice, ...invoices]);

  const transactions = readJson<CustomerTransaction[]>(TRANSACTIONS_KEY, []);
  writeJson(TRANSACTIONS_KEY, [transaction, ...transactions]);

  const operations = readJson<PlatformOperation[]>(
    PLATFORM_OPERATIONS_KEY,
    mockPlatformOperations
  );
  writeJson(PLATFORM_OPERATIONS_KEY, [operation, ...operations]);

  const cafes = readJson<PlatformCafe[]>(PLATFORM_CAFES_KEY, mockPlatformCafes);
  writeJson(
    PLATFORM_CAFES_KEY,
    cafes.map((cafe) =>
      cafe.id === cafeId
        ? {
            ...cafe,
            totalRevenue: cafe.totalRevenue + total,
            totalOrders: cafe.totalOrders + 1,
          }
        : cafe
    )
  );

  const customers = readJson<PlatformCustomer[]>(
    PLATFORM_CUSTOMERS_KEY,
    mockPlatformCustomers
  );

  const exists = customers.some((c) => c.id === customer.id);
  const nextCustomers = exists
    ? customers.map((c) =>
        c.id === customer.id
          ? {
              ...c,
              totalSpent: c.totalSpent + total,
              loyaltyPoints: c.loyaltyPoints + loyaltyPointsEarned,
            }
          : c
      )
    : [
        {
          id: customer.id,
          fullName: customer.fullName,
          phone: customer.phone,
          email: customer.email,
          cafeId,
          cafeName,
          status: "نشط" as const,
          totalSpent: total,
          loyaltyPoints: loyaltyPointsEarned,
          createdAt,
        },
        ...customers,
      ];

  writeJson(PLATFORM_CUSTOMERS_KEY, nextCustomers);

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

  return { orderId, total, loyaltyPointsEarned };
}
