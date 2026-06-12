export type CustomerProfile = {
  id: string;
  cafeSlug: string;
  fullName: string;
  phone: string;
  email?: string;
  createdAt: string;
};

export type CustomerOrderStatus =
  | "بانتظار موافقة الكوفي"
  | "مقبول"
  | "مرفوض"
  | "ملغي من العميل";

export type CustomerOrder = {
  id: string;
  cafeSlug: string;
  customerId: string;
  customerName: string;
  status: CustomerOrderStatus;
  items: string[];
  total: number;
  createdAt: string;
  branchName?: string;
  pickupAt?: string;
  notes?: string;
  rejectionReason?: string;
};

export type CustomerInvoice = {
  id: string;
  cafeSlug: string;
  customerId: string;
  title: string;
  amount: number;
  status: "مدفوعة" | "غير مدفوعة" | "ملغية";
  createdAt: string;
};

export type CustomerTransaction = {
  id: string;
  cafeSlug: string;
  customerId: string;
  type: "طلب" | "حجز" | "نقاط" | "فاتورة";
  title: string;
  description: string;
  points?: number;
  amount?: number;
  createdAt: string;
};

export const CUSTOMER_KEY = "barndaksa_customers_qatrah";
export const ORDERS_KEY = "barndaksa_qatrah_orders";
export const INVOICES_KEY = "barndaksa_qatrah_invoices";
export const TRANSACTIONS_KEY = "barndaksa_qatrah_customer_transactions";

export const mockOrders: CustomerOrder[] = [];
export const mockInvoices: CustomerInvoice[] = [];
export const mockTransactions: CustomerTransaction[] = [];