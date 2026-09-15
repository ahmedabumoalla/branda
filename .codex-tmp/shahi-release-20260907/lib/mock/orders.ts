/** Pickup-only flow: pay at cafe, no in-platform payment */
export type OrderStatus =
  | "بانتظار موافقة الكوفي"
  | "مقبول"
  | "مكتمل"
  | "غير مكتمل"
  | "مرفوض"
  | "ملغي من العميل";

export type PaymentStatus = "الدفع عند الاستلام";

export type CafeOrderItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
};

export type CafeOrder = {
  id: string;
  cafeSlug: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  branchName?: string;
  type: "استلام";
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  pickupAt?: string;
  rejectionReason?: string;
  cafeResponseAt?: string;
  items: CafeOrderItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  loyaltyPointsEarned: number;
  createdAt: string;
  notes?: string;
};

export const ORDERS_KEY = "barndaksa_qatrah_orders";

export const mockCafeOrders: CafeOrder[] = [
  {
    id: "ORD-1001",
    cafeSlug: "qatrah",
    customerId: "mock_customer_1",
    customerName: "عبدالله",
    customerPhone: "0550000001",
    customerEmail: "customer@email.com",
    branchName: "فرع التحلية",
    type: "استلام",
    status: "بانتظار موافقة الكوفي",
    paymentStatus: "الدفع عند الاستلام",
    pickupAt: "2026-05-22 18:00",
    items: [
      { id: "1", productId: "1", name: "لاتيه فانيلا", quantity: 2, unitPrice: 18 },
      { id: "2", productId: "3", name: "كوكيز شوكولاتة", quantity: 1, unitPrice: 12 },
    ],
    subtotal: 48,
    discountAmount: 5,
    taxAmount: 6.45,
    total: 49.45,
    loyaltyPointsEarned: 49,
    createdAt: "2026-05-22",
    notes: "بدون سكر",
  },
];
