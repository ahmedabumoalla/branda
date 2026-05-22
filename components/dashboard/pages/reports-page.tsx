"use client";

import { BarChart3, CalendarDays, Receipt, Star, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatSar } from "@/lib/format";
import { ORDERS_KEY, mockCafeOrders, type CafeOrder } from "@/lib/mock/orders";
import { CUSTOMER_KEY, type CustomerProfile } from "@/lib/mock/customer-activity";
import { REVIEWS_KEY, mockReviews, type CafeReview } from "@/lib/mock/reviews";
import { mockReservations, type CafeReservation } from "@/lib/mock/reservations";

const RESERVATIONS_KEY = "branda_qatrah_reservations";

export function ReportsPageClient() {
  const [orders, setOrders] = useState<CafeOrder[]>(mockCafeOrders);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [reviews, setReviews] = useState<CafeReview[]>(mockReviews);
  const [reservations, setReservations] = useState<CafeReservation[]>(mockReservations);

  useEffect(() => {
    const savedOrders = localStorage.getItem(ORDERS_KEY);
    const savedCustomers = localStorage.getItem(CUSTOMER_KEY);
    const savedReviews = localStorage.getItem(REVIEWS_KEY);
    const savedReservations = localStorage.getItem(RESERVATIONS_KEY);

    if (savedOrders) setOrders(JSON.parse(savedOrders));
    if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
    if (savedReviews) setReviews(JSON.parse(savedReviews));
    if (savedReservations) setReservations(JSON.parse(savedReservations));
  }, []);

  const totalSales = useMemo(() => orders.reduce((sum, order) => sum + order.total, 0), [orders]);
  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  const stats = [
    { title: "إجمالي المبيعات", value: formatSar(totalSales), icon: Receipt },
    { title: "عدد الطلبات", value: orders.length, icon: BarChart3 },
    { title: "العملاء", value: customers.length, icon: Users },
    { title: "الحجوزات", value: reservations.length, icon: CalendarDays },
    { title: "متوسط التقييم", value: avgRating.toFixed(1), icon: Star },
  ];

  return (
    <div dir="rtl" className="min-h-screen px-6 py-8 text-[#2B1710]">
      <header className="mb-8">
        <p className="font-black text-[#8B5E3C]">لوحة برندة</p>
        <h1 className="mt-2 text-4xl font-black text-[#3A2117]">التقارير</h1>
        <p className="mt-2 text-[#7A6255]">نظرة شاملة على أداء الكوفي والمبيعات والعملاء والتقييمات.</p>
      </header>

      <section className="mb-8 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
              <Icon className="mb-4 h-7 w-7 text-[#8B5E3C]" />
              <p className="font-black text-[#7A6255]">{item.title}</p>
              <h2 className="mt-3 text-3xl font-black text-[#3A2117]">{item.value}</h2>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-[#3A2117]">أداء المبيعات</h2>
          <div className="mt-8 flex h-80 items-end gap-4 rounded-3xl bg-[#F8F4EF] p-6">
            {[45, 72, 58, 88, 64, 79, 51].map((height, i) => (
              <div key={i} className="flex-1 rounded-t-3xl bg-[#6B3A25]" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-[#E5D8CD] bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-[#3A2117]">أحدث الطلبات</h2>
          <div className="mt-5 space-y-3">
            {orders.slice(0, 5).map((order) => (
              <div key={order.id} className="rounded-2xl bg-[#F8F4EF] p-4">
                <div className="flex justify-between gap-3">
                  <h3 className="font-black">{order.customerName}</h3>
                  <span className="font-black text-[#6B3A25]">{formatSar(order.total)}</span>
                </div>
                <p className="mt-2 text-sm font-bold text-[#7A6255]">{order.status} • {order.createdAt}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}