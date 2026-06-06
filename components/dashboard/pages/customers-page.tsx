"use client";

import { Receipt, Search, ShoppingBag, Star, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import {
  type CustomerOrder,
  type CustomerProfile,
} from "@/lib/mock/customer-activity";
import { type CafeReservation } from "@/lib/mock/reservations";

type Props = {
  initialCustomers: CustomerProfile[];
  initialOrders: CustomerOrder[];
  initialReservations: CafeReservation[];
  configError?: string;
};

export function CustomersPageClient({
  initialCustomers,
  initialOrders,
  initialReservations,
  configError,
}: Props) {
  const [customers] = useState<CustomerProfile[]>(initialCustomers);
  const [orders] = useState<CustomerOrder[]>(initialOrders);
  const [reservations] = useState<CafeReservation[]>(initialReservations);
  const [query, setQuery] = useState("");

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
    const customerReservations = reservations.filter(
      (r) => r.customerId === customer.id || r.phone === customer.phone
    );

    const totalSpent = customerOrders
      .filter((order) => order.status === "مقبول")
      .reduce((sum, order) => sum + order.total, 0);

    return {
      orders: customerOrders,
      invoices: [] as { id: string }[],
      transactions: [] as { id: string; title: string; createdAt: string; points?: number }[],
      reservations: customerReservations,
      points: 0,
      totalSpent,
    };
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="عملاء الكوفي"
        subtitle="هنا تشوف كل عميل، طلباته، حجوزاته، نقاطه، عملياته، وفواتيره."
      >
        {configError ? (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">
            {configError}
          </div>
        ) : null}
        {!customers.length && !configError ? (
          <div className="mb-6 rounded-2xl border border-[#E5D8CD] bg-[#F8F4EF] px-4 py-8 text-center font-bold text-[#7A6255]">
            لا يوجد عملاء مسجلون بعد.
          </div>
        ) : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="عدد العملاء" value={customers.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="إجمالي الطلبات" value={orders.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="إجمالي الحجوزات" value={reservations.length} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="الفواتير" value={0} />
          </BentoCard>
        </BentoGrid>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو رقم الجوال..."
              className="pr-12"
            />
          </div>
        </FilterBar>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {filtered.map((customer) => {
                const data = getCustomerData(customer);

                return (
                  <SoftCard key={customer.id}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                      <UserRound className="h-7 w-7" />
                    </div>

                    <div>
                      <h2 className="text-2xl font-black text-[#3A2117]">
                        {customer.fullName}
                      </h2>
                      <p className="mt-1 font-bold text-[#7A6255]">{customer.phone}</p>
                      <p className="mt-1 text-sm font-bold text-[#7A6255]">
                        {customer.email || "بدون بريد"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <ShoppingBag className="mx-auto h-5 w-5 text-[#6B3A25]" />
                      <p className="mt-2 text-sm font-black">طلبات</p>
                      <h3 className="text-2xl font-black">{data.orders.length}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <Receipt className="mx-auto h-5 w-5 text-[#6B3A25]" />
                      <p className="mt-2 text-sm font-black">فواتير</p>
                      <h3 className="text-2xl font-black">{data.invoices.length}</h3>
                    </div>
                    <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center">
                      <Star className="mx-auto h-5 w-5 text-[#6B3A25]" />
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
                    <h3 className="mb-3 font-black">آخر الحجوزات</h3>
                    {data.reservations.slice(0, 3).map((r) => (
                      <p key={r.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                        {r.type} • {r.date} • {r.status}
                      </p>
                    ))}
                    {!data.reservations.length ? (
                      <p className="text-sm text-[#7A6255]">لا يوجد</p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <h3 className="mb-3 font-black">آخر الطلبات</h3>
                    {data.orders.slice(0, 3).map((o) => (
                      <p key={o.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                        {o.items.join("، ")} • {o.status}
                      </p>
                    ))}
                    {!data.orders.length ? (
                      <p className="text-sm text-[#7A6255]">لا يوجد</p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl bg-[#F8F4EF] p-4">
                    <h3 className="mb-3 font-black">سجل العمليات</h3>
                    {data.transactions.slice(0, 3).map((t) => (
                      <p key={t.id} className="mb-2 text-sm font-bold text-[#7A6255]">
                        {t.title} • {t.createdAt}
                      </p>
                    ))}
                    {!data.transactions.length ? (
                      <p className="text-sm text-[#7A6255]">لا يوجد</p>
                    ) : null}
                  </div>
                </div>
                  </SoftCard>
                );
              })}
            </section>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
