"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Bot,
  CalendarDays,
  Camera,
  Package,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  SoftCard,
  StatPill,
  StatusBadge,
} from "@/components/ui/design-system";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";
import type { CustomerProfile } from "@/lib/mock/customer-activity";
import type { CafeOrder } from "@/lib/mock/orders";
import type { CafeReservation } from "@/lib/mock/reservations";
import { getBusinessCopy } from "@/lib/platform/business-copy";

type Props = {
  customers: CustomerProfile[];
  orders: CafeOrder[];
  reservations: CafeReservation[];
  productCount: number;
  experienceSubmissionCount: number;
  cafeSlug: string;
  cafeName: string;
  businessCategory?: string;
  ownerName: string;
  configError?: string;
};

type OrderChartPoint = {
  key: string;
  label: string;
  count: number;
};

function getOrderChartPoints(orders: CafeOrder[]): OrderChartPoint[] {
  const now = new Date();

  const points = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);

    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
        month: "short",
      }).format(date),
      count: 0,
    };
  });

  const chartMap = new Map(points.map((point) => [point.key, point]));

  orders.forEach((order) => {
    const date = new Date(order.createdAt);

    if (Number.isNaN(date.getTime())) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const point = chartMap.get(key);

    if (point) {
      point.count += 1;
    }
  });

  return points;
}

export function DashboardHomeClient({
  customers,
  orders,
  reservations,
  productCount,
  experienceSubmissionCount,
  cafeSlug,
  cafeName,
  businessCategory,
  ownerName,
  configError,
}: Props) {
  const copy = getBusinessCopy(businessCategory);
  const pendingReservations = reservations.filter(
    (reservation) => reservation.status === "بانتظار الرد"
  );

  const chartPoints = useMemo(() => getOrderChartPoints(orders), [orders]);
  const highestOrderCount = Math.max(...chartPoints.map((point) => point.count), 1);

  const quickActions = [
    ["/dashboard/menu", "إدارة المنيو"],
    ["/dashboard/offers", "إنشاء عرض"],
    ["/dashboard/reservations", "متابعة الحجوزات"],
    ["/dashboard/marketing", "توثيق التجربة"],
    ["/dashboard/subscription", "الاشتراك والباقات"],
    ["/dashboard/settings", `إعدادات ${copy.casualNoun}`],
  ] as const;

  return (
    <DashboardPageShell
      title={`لوحة ${cafeName}`}
      subtitle={
        ownerName
          ? `أهلًا ${ownerName} تابع أداء علامتك التجارية ومؤشرات النشاط اليومية`
          : "تابع أداء علامتك التجارية ومؤشرات النشاط اليومية"
      }
      action={
        <div className="flex flex-wrap items-center gap-3">
          <BarndaksaLogo variant="brown" width={120} height={48} />
          {cafeSlug ? (
            <LinkButton
              href={getCafePublicUrl(cafeSlug)}
              variant="primary"
              target="_blank"
            >
              زيارة الفرع الالكتروني
            </LinkButton>
          ) : null}
        </div>
      }
    >
      {configError ? (
        <SoftCard className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          {configError}
        </SoftCard>
      ) : null}

      <BentoGrid className="mb-6">
        <BentoCard variant="white">
          <Package className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="منتجات المنيو"
            value={productCount}
          />
        </BentoCard>

        <BentoCard variant="white">
          <Users className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="العملاء المسجلون"
            value={customers.length}
          />
        </BentoCard>

        <BentoCard variant="white">
          <CalendarDays className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="طلبات الحجز"
            value={reservations.length}
            hint={`${pendingReservations.length} بانتظار الرد`}
          />
        </BentoCard>

        <BentoCard variant="white">
          <Camera className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="مشاركات توثيق التجربة"
            value={experienceSubmissionCount}
          />
        </BentoCard>
      </BentoGrid>

      <BentoGrid className="mb-6">
        <BentoCard variant="gold" span="3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <ShoppingBag className="h-7 w-7 text-[#F6C35B]" />
                <h2 className="text-xl font-black text-[#FCF8F3]">
                  حركة الطلبات خلال آخر ستة أشهر
                </h2>
              </div>
              <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                {orders.length} طلب مسجل حتى الآن
              </p>
            </div>

            <StatusBadge tone="gold">بيانات فعلية</StatusBadge>
          </div>

          <div className="mt-8 flex h-56 items-end gap-3">
            {chartPoints.map((point) => {
              const height =
                point.count > 0
                  ? Math.max((point.count / highestOrderCount) * 100, 10)
                  : 3;

              return (
                <div
                  key={point.key}
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <p className="mb-2 text-center text-sm font-black text-[#FCF8F3]">
                    {point.count}
                  </p>

                  <div
                    className="rounded-t-2xl bg-gradient-to-t from-[#F6C35B]/35 to-[#F6C35B] transition group-hover:from-[#F6C35B]/60 group-hover:to-[#FFD77D]"
                    style={{ height: `${height}%` }}
                  />

                  <p className="mt-3 truncate text-center text-xs font-black text-[#CBB29C]">
                    {point.label}
                  </p>
                </div>
              );
            })}
          </div>
        </BentoCard>

        <BentoCard variant="white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6B3A25]/10 text-[#6B3A25]">
              <Bot className="h-7 w-7" />
            </div>

            <span className="inline-flex items-center gap-1 rounded-full bg-[#D9A33F]/15 px-3 py-1 text-xs font-black text-[#6B3A25]">
              <Sparkles className="h-3.5 w-3.5" />
              قريبا
            </span>
          </div>

          <h2 className="mt-5 text-xl font-black text-[#311912]">
            مساعد برندة الذكي
          </h2>

          <p className="mt-3 text-sm font-bold leading-7 text-[#806A5E]">
            قراءة الأداء واكتشاف الفرص واقتراح خطوات تشغيلية تناسب علامتك التجارية
          </p>

          <div className="mt-6 rounded-2xl bg-[#F8F4EF] px-4 py-4 text-center text-sm font-black text-[#6B3A25]">
            النموذج تحت التطوير
          </div>
        </BentoCard>
      </BentoGrid>

      <BentoGrid>
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#311912]">إجراءات سريعة</h2>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {quickActions.map(([href, title]) => (
              <Link
                key={href}
                href={href}
                className="rounded-2xl bg-[#F8F4EF] px-5 py-4 font-black text-[#311912] transition hover:bg-[#EFE2D3]"
              >
                {title}
              </Link>
            ))}
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#311912]">آخر طلبات الحجز</h2>

            <Link
              href="/dashboard/reservations"
              className="font-black text-[#6B3A25]"
            >
              عرض الكل
            </Link>
          </div>

          <div className="space-y-2">
            {reservations.slice(0, 4).map((reservation) => (
              <SoftCard key={reservation.id} className="p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-black">{reservation.customerName}</span>
                  <span className="text-sm font-bold text-[#6B3A25]">
                    {reservation.status}
                  </span>
                </div>

                <p className="mt-1 text-xs font-bold text-[#806A5E]">
                  {reservation.type} | {reservation.date} | {reservation.time}
                </p>
              </SoftCard>
            ))}

            {!reservations.length ? (
              <p className="text-sm font-bold text-[#806A5E]">
                لا توجد طلبات حجز حتى الآن
              </p>
            ) : null}
          </div>
        </BentoCard>
      </BentoGrid>
    </DashboardPageShell>
  );
}
