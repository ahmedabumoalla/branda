"use client";

import Link from "next/link";
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
import type { CafeReservation } from "@/lib/mock/reservations";

const RESERVATIONS_KEY = "branda_qatrah_reservations";

export default function DashboardPage() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<CafeReservation[]>([]);

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

  const pendingReservations = reservations.filter(
    (r) => r.status === "بانتظار الرد"
  );

  const acceptedReservations = reservations.filter(
    (r) => r.status === "مقبول"
  );

  const paidInvoicesTotal = useMemo(() => {
    return invoices
      .filter((invoice) => invoice.status === "مدفوعة")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
  }, [invoices]);

  const loyaltyPoints = useMemo(() => {
    return transactions.reduce((sum, item) => sum + (item.points || 0), 0);
  }, [transactions]);

  const stats = [
    {
      title: "طلبات اليوم",
      value: orders.length.toString(),
      desc: "طلبات العملاء المسجلة",
    },
    {
      title: "حجوزات بانتظار الرد",
      value: pendingReservations.length.toString(),
      desc: `${acceptedReservations.length} حجوزات مقبولة`,
    },
    {
      title: "عملاء الكوفي",
      value: customers.length.toString(),
      desc: "حسابات العملاء المسجلة",
    },
    {
      title: "إجمالي الفواتير",
      value: formatSar(paidInvoicesTotal),
      desc: `${invoices.length} فاتورة`,
    },
  ];

  const quickActions = [
    ["تعديل المنيو", "/dashboard/menu"],
    ["إضافة عرض", "/dashboard/offers"],
    ["مراجعة الحجوزات", "/dashboard/reservations"],
    ["إدارة العملاء", "/dashboard/customers"],
    ["إعداد نقاط الولاء", "/dashboard/loyalty"],
    ["إعدادات الكوفي", "/dashboard/settings"],
  ];

  return (
    <div className="min-h-screen px-8 py-8">
      <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
          <h1 className="mt-2 text-4xl font-black text-[#3A2117]">
            مرحبًا في لوحة قطرة
          </h1>
          <p className="mt-2 text-[#7A6255]">
            أي تعديل هنا ينعكس مباشرة على صفحة الكوفي للعميل.
          </p>
        </div>

        <Link
          href="/c/qatrah"
          target="_blank"
          className="rounded-2xl bg-[#3A2117] px-6 py-4 font-black text-[#F8E8D2]"
        >
          زيارة الكوفي
        </Link>
      </header>

      <section className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div
            key={item.title}
            className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm"
          >
            <p className="font-black text-[#7A6255]">{item.title}</p>
            <h2 className="mt-3 text-4xl font-black text-[#3A2117]">
              {item.value}
            </h2>
            <p className="mt-2 text-sm font-bold text-[#8A7062]">
              {item.desc}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#3A2117]">
                أداء الكوفي
              </h2>
              <p className="mt-1 text-sm font-bold text-[#7A6255]">
                ملخص سريع لحركة الطلبات والحجوزات والعملاء.
              </p>
            </div>

            <span className="rounded-2xl bg-[#F8F4EF] px-4 py-2 text-sm font-black text-[#6B3A25]">
              آخر 7 أيام
            </span>
          </div>

          <div className="flex h-80 items-end gap-4 rounded-3xl bg-[#F8F4EF] p-6">
            {[55, 75, 45, 85, 60, 70, 40].map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-3xl bg-[#6B3A25]"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-2xl font-black text-[#3A2117]">
            إجراءات سريعة
          </h2>

          <div className="grid gap-3">
            {quickActions.map(([title, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-2xl bg-[#F8F4EF] px-5 py-4 font-black text-[#3A2117] transition hover:bg-[#EFE8DF]"
              >
                {title}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black text-[#3A2117]">
              آخر الحجوزات
            </h2>

            <Link
              href="/dashboard/reservations"
              className="font-black text-[#6B3A25]"
            >
              عرض الكل
            </Link>
          </div>

          <div className="space-y-3">
            {reservations.slice(0, 4).map((reservation) => (
              <div
                key={reservation.id}
                className="rounded-2xl bg-[#F8F4EF] p-4"
              >
                <div className="flex justify-between gap-3">
                  <h3 className="font-black text-[#3A2117]">
                    {reservation.customerName}
                  </h3>
                  <span className="font-black text-[#6B3A25]">
                    {reservation.status}
                  </span>
                </div>

                <p className="mt-1 text-sm font-bold text-[#7A6255]">
                  {reservation.type} • {reservation.date} • {reservation.time}
                </p>
              </div>
            ))}

            {!reservations.length ? (
              <p className="rounded-2xl bg-[#F8F4EF] p-4 text-[#7A6255]">
                لا توجد حجوزات حتى الآن.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black text-[#3A2117]">
              ملخص العملاء والولاء
            </h2>

            <Link
              href="/dashboard/customers"
              className="font-black text-[#6B3A25]"
            >
              عرض العملاء
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-[#F8F4EF] p-5">
              <p className="text-sm font-black text-[#7A6255]">
                عدد العملاء
              </p>
              <h3 className="mt-2 text-3xl font-black">{customers.length}</h3>
            </div>

            <div className="rounded-2xl bg-[#F8F4EF] p-5">
              <p className="text-sm font-black text-[#7A6255]">
                نقاط الولاء المسجلة
              </p>
              <h3 className="mt-2 text-3xl font-black">{loyaltyPoints}</h3>
            </div>

            <div className="rounded-2xl bg-[#F8F4EF] p-5">
              <p className="text-sm font-black text-[#7A6255]">
                العمليات
              </p>
              <h3 className="mt-2 text-3xl font-black">
                {transactions.length}
              </h3>
            </div>

            <div className="rounded-2xl bg-[#F8F4EF] p-5">
              <p className="text-sm font-black text-[#7A6255]">
                الفواتير
              </p>
              <h3 className="mt-2 text-3xl font-black">
                {invoices.length}
              </h3>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}