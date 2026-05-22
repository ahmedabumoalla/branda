"use client";

import { Receipt, Search, ShoppingBag, Star, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatSar } from "@/lib/format";
import {
  CUSTOMER_KEY,
  INVOICES_KEY,
  ORDERS_KEY,
  TRANSACTIONS_KEY,
  type CustomerInvoice,
  type CustomerOrder,
  type CustomerProfile,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";

const RESERVATIONS_KEY = "branda_qatrah_reservations";

type Reservation = {
  id: string;
  customerId?: string;
  customerName: string;
  phone: string;
  type: string;
  guests: number;
  date: string;
  time: string;
  status: string;
  createdAt: string;
};

export function CustomersPageClient() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const savedCustomers = localStorage.getItem(CUSTOMER_KEY);
    const savedOrders = localStorage.getItem(ORDERS_KEY);
    const savedInvoices = localStorage.getItem(INVOICES_KEY);
    const savedTransactions = localStorage.getItem(TRANSACTIONS_KEY);
    const savedReservations = localStorage.getItem(RESERVATIONS_KEY);

    if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
    if (savedOrders) setOrders(JSON.parse(savedOrders));
    if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    if (savedReservations) setReservations(JSON.parse(savedReservations));
  }, []);

  const filtered = useMemo(() => {
    return customers.filter(
      (customer) =>
        customer.fullName.includes(query) ||
        customer.phone.includes(query) ||
        customer.email?.includes(query)
    );
  }, [customers, query]);

  function getCustomerData(customer: CustomerProfile) {
    const customerOrders = orders.filter((o) => o.customerId === customer.id);
    const customerInvoices = invoices.filter((i) => i.customerId === customer.id);
    const customerTransactions = transactions.filter((t) => t.customerId === customer.id);
    const customerReservations = reservations.filter(
      (r) => r.customerId === customer.id || r.phone === customer.phone
    );

    const points = customerTransactions.reduce(
      (sum, item) => sum + (item.points || 0),
      0
    );

    const totalSpent = customerInvoices
      .filter((invoice) => invoice.status === "مدفوعة")
      .reduce((sum, invoice) => sum + invoice.amount, 0);

    return {
      orders: customerOrders,
      invoices: customerInvoices,
      transactions: customerTransactions,
      reservations: customerReservations,
      points,
      totalSpent,
    };
  }

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">
          عملاء الكوفي
        </h1>
        <p className="mt-2 text-[#7A6255]">
          هنا تشوف كل عميل، طلباته، حجوزاته، نقاطه، عملياته، وفواتيره.
        </p>
      </header>

      <section className="mb-8 grid gap-5 md:grid-cols-4">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">عدد العملاء</p>
          <h2 className="mt-3 text-4xl font-black">{customers.length}</h2>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">إجمالي الطلبات</p>
          <h2 className="mt-3 text-4xl font-black">{orders.length}</h2>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">إجمالي الحجوزات</p>
          <h2 className="mt-3 text-4xl font-black">{reservations.length}</h2>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <p className="text-[#7A6255] font-black">الفواتير</p>
          <h2 className="mt-3 text-4xl font-black">{invoices.length}</h2>
        </div>
      </section>

      <section className="mb-8 rounded-3xl border border-[#E5D8CD] bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A7062]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العميل أو رقم الجوال..."
            className="h-14 w-full rounded-2xl border border-[#E5D8CD] bg-white pr-12 pl-4 text-right font-bold outline-none"
          />
        </div>
      </section>

      <section className="grid gap-5">
        {filtered.map((customer) => {
          const data = getCustomerData(customer);

          return (
            <article
              key={customer.id}
              className="rounded-3xl border border-white bg-white/85 p-6 shadow-lg"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
                    <UserRound className="h-7 w-7" />
                  </div>

                  <div>
                    <h2 className="text-2xl font-black text-[#3A2117]">
                      {customer.fullName}
                    </h2>
                    <p className="mt-1 font-bold text-[#7A6255]">
                      {customer.phone}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[#8A7062]">
                      {customer.email || "بدون بريد"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                    <ShoppingBag className="mx-auto h-5 w-5 text-[#8B5E3C]" />
                    <p className="mt-2 text-sm font-black">طلبات</p>
                    <h3 className="text-2xl font-black">{data.orders.length}</h3>
                  </div>

                  <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                    <Receipt className="mx-auto h-5 w-5 text-[#8B5E3C]" />
                    <p className="mt-2 text-sm font-black">فواتير</p>
                    <h3 className="text-2xl font-black">{data.invoices.length}</h3>
                  </div>

                  <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                    <Star className="mx-auto h-5 w-5 text-[#8B5E3C]" />
                    <p className="mt-2 text-sm font-black">نقاط</p>
                    <h3 className="text-2xl font-black">{data.points}</h3>
                  </div>

                  <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                    <p className="text-sm font-black">إنفاق</p>
                    <h3 className="mt-2 text-xl font-black text-[#6B3A25]">
                      {formatSar(data.totalSpent)}
                    </h3>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <h3 className="font-black mb-3">آخر الحجوزات</h3>
                  {data.reservations.slice(0, 3).map((r) => (
                    <p key={r.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                      {r.type} • {r.date} • {r.status}
                    </p>
                  ))}
                  {!data.reservations.length ? <p className="text-sm text-[#7A6255]">لا يوجد</p> : null}
                </div>

                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <h3 className="font-black mb-3">آخر الطلبات</h3>
                  {data.orders.slice(0, 3).map((o) => (
                    <p key={o.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                      {o.items.join("، ")} • {o.status}
                    </p>
                  ))}
                  {!data.orders.length ? <p className="text-sm text-[#7A6255]">لا يوجد</p> : null}
                </div>

                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <h3 className="font-black mb-3">سجل العمليات</h3>
                  {data.transactions.slice(0, 3).map((t) => (
                    <p key={t.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                      {t.title} • {t.createdAt}
                    </p>
                  ))}
                  {!data.transactions.length ? <p className="text-sm text-[#7A6255]">لا يوجد</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}