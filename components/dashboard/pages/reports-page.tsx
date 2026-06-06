"use client";

import { BarChart3, CalendarDays, Receipt, Star, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { type CafeOrder } from "@/lib/mock/orders";
import { type CustomerProfile } from "@/lib/mock/customer-activity";
import { type CafeReview } from "@/lib/mock/reviews";
import { type CafeReservation } from "@/lib/mock/reservations";

type Props = {
  initialOrders: CafeOrder[];
  initialCustomers: CustomerProfile[];
  initialReviews: CafeReview[];
  initialReservations: CafeReservation[];
  configError?: string;
};

export function ReportsPageClient({
  initialOrders,
  initialCustomers,
  initialReviews,
  initialReservations,
  configError,
}: Props) {
  const [orders] = useState<CafeOrder[]>(initialOrders);
  const [customers] = useState<CustomerProfile[]>(initialCustomers);
  const [reviews] = useState<CafeReview[]>(initialReviews);
  const [reservations] = useState<CafeReservation[]>(initialReservations);

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
    <div dir="rtl">
      <DashboardPageShell
        title="التقارير"
        subtitle="نظرة شاملة على أداء الكوفي والمبيعات والعملاء والتقييمات."
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        <BentoGrid className="mb-6">
          {stats.map((item, index) => {
            const Icon = item.icon;
            return (
              <BentoCard
                key={item.title}
                variant="white"
                span={index === 0 ? "2" : "1"}
              >
                <Icon className="mb-4 h-7 w-7 text-[#6B3A25]" />
                <StatPill label={item.title} value={item.value} />
              </BentoCard>
            );
          })}
        </BentoGrid>

        <BentoGrid>
          <BentoCard variant="white" span="row2">
            <h2 className="text-2xl font-black text-[#3A2117]">أداء المبيعات</h2>
            <div className="mt-8 flex h-80 items-end gap-4 rounded-3xl bg-[#F8F4EF] p-6">
              {[45, 72, 58, 88, 64, 79, 51].map((height, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-3xl bg-[#6B3A25]"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="2">
            <h2 className="text-2xl font-black text-[#3A2117]">أحدث الطلبات</h2>
            <div className="mt-5 space-y-3">
              {orders.slice(0, 5).map((order) => (
                <SoftCard key={order.id} className="p-4">
                  <div className="flex justify-between gap-3">
                    <h3 className="font-black">{order.customerName}</h3>
                    <span className="font-black text-[#6B3A25]">
                      {formatSar(order.total)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[#7A6255]">
                    {order.status} • {order.createdAt}
                  </p>
                </SoftCard>
              ))}
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
