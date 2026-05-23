"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { BrandaLogo } from "@/components/ui/branda-logo";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  LinkButton,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { getCafePublicUrl } from "@/lib/platform/cafe-domain";
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
import { ORDERS_KEY as CAFE_ORDERS_KEY, mockCafeOrders, type CafeOrder } from "@/lib/mock/orders";

const RESERVATIONS_KEY = "branda_qatrah_reservations";

export default function DashboardPage() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [cafeOrders, setCafeOrders] = useState<CafeOrder[]>(mockCafeOrders);
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [reservations, setReservations] = useState<CafeReservation[]>([]);

  useEffect(() => {
    const savedCustomers = localStorage.getItem(CUSTOMER_KEY);
    const savedOrders = localStorage.getItem(ORDERS_KEY);
    const savedCafeOrders = localStorage.getItem(CAFE_ORDERS_KEY);
    const savedInvoices = localStorage.getItem(INVOICES_KEY);
    const savedTransactions = localStorage.getItem(TRANSACTIONS_KEY);
    const savedReservations = localStorage.getItem(RESERVATIONS_KEY);

    if (savedCustomers) setCustomers(JSON.parse(savedCustomers));
    if (savedOrders) setOrders(JSON.parse(savedOrders));
    if (savedCafeOrders) setCafeOrders(JSON.parse(savedCafeOrders));
    if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    if (savedReservations) setReservations(JSON.parse(savedReservations));
  }, []);

  const pendingReservations = reservations.filter((r) => r.status === "بانتظار الرد");
  const paidInvoicesTotal = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === "مدفوعة")
        .reduce((sum, invoice) => sum + invoice.amount, 0),
    [invoices]
  );
  const revenueFromOrders = useMemo(
    () => cafeOrders.reduce((sum, o) => sum + o.total, 0),
    [cafeOrders]
  );

  const quickActions = [
    ["/dashboard/menu", "تعديل المنيو"],
    ["/dashboard/offers", "إضافة عرض"],
    ["/dashboard/reservations", "مراجعة الحجوزات"],
    ["/dashboard/subscription", "الاشتراك والباقات"],
    ["/dashboard/settings", "إعدادات الكوفي"],
  ] as const;

  return (
    <DashboardPageShell
      title="مرحبًا في لوحة قطرة"
      subtitle="أي تعديل هنا ينعكس مباشرة على صفحة الكوفي للعميل."
      action={
        <div className="flex flex-wrap items-center gap-3">
          <BrandaLogo variant="brown" width={120} height={48} />
          <LinkButton href={getCafePublicUrl("qatrah")} variant="primary" target="_blank">
            زيارة الكوفي
          </LinkButton>
        </div>
      }
    >
      <BentoGrid className="mb-8">
        <BentoCard variant="gold" span="2" className="md:row-span-2">
          <div className="flex h-full flex-col justify-between">
            <div>
              <p className="text-sm font-black text-[#F6C35B]/90">إيرادات الطلبات</p>
              <p className="mt-3 text-3xl font-black sm:text-4xl lg:text-5xl">
                {formatSar(revenueFromOrders)}
              </p>
              <p className="mt-2 text-sm font-bold text-[#CBB29C]">
                {cafeOrders.length} طلب مسجل
              </p>
            </div>
            <div className="mt-8 flex h-40 items-end gap-2 sm:h-48">
              {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-xl bg-gradient-to-t from-[#F6C35B]/50 to-[#F6C35B]"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </BentoCard>

        <BentoCard variant="white">
          <ShoppingBag className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="طلبات اليوم" value={orders.length + cafeOrders.length} />
        </BentoCard>

        <BentoCard variant="white">
          <CalendarDays className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="حجوزات بانتظار الرد"
            value={pendingReservations.length}
            hint={`${reservations.length} إجمالي`}
          />
        </BentoCard>

        <BentoCard variant="white" span="2">
          <Users className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill label="عملاء الكوفي" value={customers.length} />
        </BentoCard>

        <BentoCard variant="white" span="2">
          <TrendingUp className="mb-3 h-7 w-7 text-[#6B3A25]" />
          <StatPill
            label="إجمالي الفواتير المدفوعة"
            value={formatSar(paidInvoicesTotal)}
            hint={`${invoices.length} فاتورة`}
          />
        </BentoCard>
      </BentoGrid>

      <BentoGrid>
        <BentoCard variant="white" span="2">
          <h2 className="text-xl font-black text-[#3A2117]">إجراءات سريعة</h2>
          <div className="mt-4 grid gap-2">
            {quickActions.map(([href, title]) => (
              <Link
                key={href}
                href={href}
                className="rounded-2xl bg-[#F8F4EF] px-5 py-4 font-black text-[#3A2117] transition hover:bg-[#EFE2D3]"
              >
                {title}
              </Link>
            ))}
          </div>
        </BentoCard>

        <BentoCard variant="white" span="2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black text-[#3A2117]">آخر الحجوزات</h2>
            <Link href="/dashboard/reservations" className="font-black text-[#6B3A25]">
              عرض الكل
            </Link>
          </div>
          <div className="space-y-2">
            {reservations.slice(0, 4).map((r) => (
              <SoftCard key={r.id} className="p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-black">{r.customerName}</span>
                  <span className="text-sm font-bold text-[#6B3A25]">{r.status}</span>
                </div>
                <p className="mt-1 text-xs font-bold text-[#7A6255]">
                  {r.type} • {r.date} • {r.time}
                </p>
              </SoftCard>
            ))}
            {!reservations.length ? (
              <p className="text-sm font-bold text-[#7A6255]">لا توجد حجوزات بعد.</p>
            ) : null}
          </div>
        </BentoCard>
      </BentoGrid>
    </DashboardPageShell>
  );
}
