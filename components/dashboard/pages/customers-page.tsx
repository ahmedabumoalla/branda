
"use client";

import { Ban, CalendarDays, Eye, Receipt, Search, ShoppingBag, Star, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { setCustomerStatusAction } from "@/app/actions/platform-upgrade";
import { BentoCard, BentoGrid, DashboardPageShell, FilterBar, NeumoInput, SoftCard, StatPill } from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import { type CustomerOrder, type CustomerProfile } from "@/lib/mock/customer-activity";
import { type CafeReservation } from "@/lib/mock/reservations";

type ExtendedCustomer = CustomerProfile & { status?: "active" | "suspended" | "blocked"; appInstalledAt?: string | null; lastVisitAt?: string | null };

type Props = { initialCustomers: CustomerProfile[]; initialOrders: CustomerOrder[]; initialReservations: CafeReservation[]; configError?: string };

export function CustomersPageClient({ initialCustomers, initialOrders, initialReservations, configError }: Props) {
  const [customers, setCustomers] = useState<ExtendedCustomer[]>(initialCustomers as ExtendedCustomer[]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ExtendedCustomer | null>(null);

  const filtered = useMemo(() => customers.filter((customer) => customer.fullName.includes(query) || customer.phone.includes(query) || customer.email?.includes(query)), [customers, query]);

  function getCustomerData(customer: ExtendedCustomer) {
    const orders = initialOrders.filter((o) => o.customerId === customer.id);
    const reservations = initialReservations.filter((r) => r.customerId === customer.id || r.phone === customer.phone);
    const acceptedReservations = reservations.filter((r) => r.status === "مقبول");
    const totalSpent = orders.filter((order) => order.status === "مقبول").reduce((sum, order) => sum + order.total, 0);
    return { orders, reservations, acceptedReservations, totalSpent, loyaltyUses: orders.length, reservationCheckins: acceptedReservations.length };
  }

  async function updateStatus(customer: ExtendedCustomer, status: "active" | "suspended" | "blocked") {
    await setCustomerStatusAction(customer.id, status);
    setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, status } : item));
  }

  return (
    <div dir="rtl">
      <DashboardPageShell title="العملاء" subtitle="إدارة العملاء والولاء والحجوزات وسجل النشاط من مكان واحد">
        {configError ? <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center font-black text-amber-800">{configError}</div> : null}
        <BentoGrid className="mb-6">
          <BentoCard variant="white"><StatPill label="عدد العملاء" value={customers.length} /></BentoCard>
          <BentoCard variant="white"><StatPill label="الطلبات" value={initialOrders.length} /></BentoCard>
          <BentoCard variant="white"><StatPill label="الحجوزات" value={initialReservations.length} /></BentoCard>
          <BentoCard variant="white"><StatPill label="الموقوفون" value={customers.filter((c) => c.status === "blocked" || c.status === "suspended").length} /></BentoCard>
        </BentoGrid>
        <FilterBar><div className="relative flex-1"><Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" /><NeumoInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم العميل أو رقم الجوال" className="pr-12" /></div></FilterBar>
        <BentoGrid>
          <BentoCard variant="white" span="4"><section className="grid gap-5">
            {filtered.map((customer) => { const data = getCustomerData(customer); return <SoftCard key={customer.id}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]"><UserRound className="h-7 w-7" /></div><div><h2 className="text-2xl font-black text-[#3A2117]">{customer.fullName}</h2><p className="mt-1 font-bold text-[#7A6255]">{customer.phone}</p><p className="mt-1 text-sm font-bold text-[#7A6255]">{customer.email || "بدون بريد"}</p><p className="mt-2 w-fit rounded-full bg-[#F8F4EF] px-3 py-1 text-xs font-black text-[#6B3A25]">{customer.status === "blocked" ? "محظور" : customer.status === "suspended" ? "موقوف" : "نشط"}</p></div></div>
                <div className="flex flex-wrap gap-2"><button onClick={() => setSelected(customer)} className="rounded-xl bg-[#3A2117] px-4 py-2 text-sm font-black text-white"><Eye className="inline h-4 w-4" /> السجل</button><button onClick={() => updateStatus(customer, "suspended")} className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-black text-amber-800">إيقاف</button><button onClick={() => updateStatus(customer, "blocked")} className="rounded-xl bg-red-100 px-4 py-2 text-sm font-black text-red-800"><Ban className="inline h-4 w-4" /> حظر</button><button onClick={() => updateStatus(customer, "active")} className="rounded-xl bg-green-100 px-4 py-2 text-sm font-black text-green-800">تفعيل</button></div>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3 lg:grid-cols-6"><Metric icon={ShoppingBag} label="طلبات" value={data.orders.length} /><Metric icon={CalendarDays} label="حجوزات" value={data.reservations.length} /><Metric icon={Receipt} label="إنفاق" value={formatSar(data.totalSpent)} /><Metric icon={Star} label="استخدام الولاء" value={data.loyaltyUses} /><Metric icon={CalendarDays} label="تأكيد حضور" value={data.reservationCheckins} /><Metric icon={UserRound} label="التطبيق" value={customer.appInstalledAt ? "حمّل" : "غير مؤكد"} /></div>
            </SoftCard>; })}
          </section></BentoCard>
        </BentoGrid>
      </DashboardPageShell>
      {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl"><h3 className="text-2xl font-black text-[#3A2117]">سجل العميل {selected.fullName}</h3><p className="mt-2 font-bold text-[#7A6255]">من أول يوم دخول للمنصة إلى آخر عملية مسجلة</p><div className="mt-5 grid gap-3">{getCustomerData(selected).orders.map((order) => <div key={order.id} className="rounded-2xl bg-[#F8F4EF] p-4 font-bold">طلب {order.id} • {order.status} • {formatSar(order.total)}</div>)}{getCustomerData(selected).reservations.map((reservation) => <div key={reservation.id} className="rounded-2xl bg-[#F8F4EF] p-4 font-bold">حجز {reservation.type} • {reservation.date} • {reservation.status}</div>)}{!getCustomerData(selected).orders.length && !getCustomerData(selected).reservations.length ? <p className="rounded-2xl bg-[#F8F4EF] p-4 font-bold">لا يوجد نشاط مسجل</p> : null}</div><button onClick={() => setSelected(null)} className="mt-5 rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white">إغلاق</button></div></div> : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) { return <div className="rounded-2xl bg-[#F8F4EF] p-4 text-center"><Icon className="mx-auto h-5 w-5 text-[#6B3A25]" /><p className="mt-2 text-xs font-black text-[#7A6255]">{label}</p><h3 className="mt-1 text-lg font-black text-[#3A2117]">{value}</h3></div>; }
