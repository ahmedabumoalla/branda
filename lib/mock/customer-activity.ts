export type CustomerProfile = {
  id: string;
  cafeSlug: string;
  fullName: string;
  phone: string;
  email?: string;
  createdAt: string;
};

export type CustomerOrder = {
  id: string;
  cafeSlug: string;
  customerId: string;
  customerName: string;
  status: "جديد" | "قيد التجهيز" | "جاهز" | "مكتمل" | "ملغي";
  items: string[];
  total: number;
  createdAt: string;
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

export const CUSTOMER_KEY = "branda_customers_qatrah";
export const ORDERS_KEY = "branda_qatrah_orders";
export const INVOICES_KEY = "branda_qatrah_invoices";
export const TRANSACTIONS_KEY = "branda_qatrah_customer_transactions";

export const mockOrders: CustomerOrder[] = [];
export const mockInvoices: CustomerInvoice[] = [];
export const mockTransactions: CustomerTransaction[] = [];