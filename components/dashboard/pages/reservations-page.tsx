"use client";

import { CalendarDays, Check, Clock, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import type { CafeReservation, ReservationStatus } from "@/lib/mock/reservations";

const STORAGE_KEY = "branda_qatrah_reservations";

type Props = {
  initialReservations: CafeReservation[];
};

const statusStyle: Record<ReservationStatus, string> = {
  "بانتظار الرد": "bg-amber-50 text-amber-700",
  "مقبول": "bg-green-50 text-green-700",
  "مرفوض": "bg-red-50 text-red-700",
};

export function ReservationsPageClient({ initialReservations }: Props) {
  const [reservations, setReservations] = useState<CafeReservation[]>(initialReservations);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReservationStatus | "الكل">("الكل");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setReservations(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  }, [reservations]);

  const filtered = useMemo(() => {
    return reservations.filter((r) => {
      const matchQuery =
        r.customerName.includes(query) ||
        r.phone.includes(query) ||
        r.type.includes(query);

      const matchStatus = status === "الكل" || r.status === status;

      return matchQuery && matchStatus;
    });
  }, [reservations, query, status]);

  const pendingCount = reservations.filter((r) => r.status === "بانتظار الرد").length;
  const acceptedCount = reservations.filter((r) => r.status === "مقبول").length;
  const totalGuests = reservations.reduce((sum, r) => sum + r.guests, 0);

  function updateStatus(id: string, nextStatus: ReservationStatus) {
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r))
    );
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="إدارة الحجوزات"
        subtitle="الحجوزات القادمة من صفحة الكوفي تظهر هنا، وتقدر تقبلها أو ترفضها."
      >
        <BentoGrid className="mb-6">
          <BentoCard variant="white">
            <StatPill label="بانتظار الرد" value={pendingCount} />
          </BentoCard>
          <BentoCard variant="white">
            <StatPill label="حجوزات مقبولة" value={acceptedCount} />
          </BentoCard>
          <BentoCard variant="white" span="2">
            <StatPill label="إجمالي الضيوف" value={totalGuests} />
          </BentoCard>
        </BentoGrid>

        <FilterBar>
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" />
            <NeumoInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم العميل أو رقم الجوال أو نوع الحجز..."
              className="pr-12"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {["الكل", "بانتظار الرد", "مقبول", "مرفوض"].map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item as ReservationStatus | "الكل")}
                className={`rounded-2xl px-5 py-3 text-sm font-black ${
                  status === item
                    ? "bg-[#3A2117] text-[#F8F4EF]"
                    : "bg-[#F8F4EF] text-[#3A2117]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </FilterBar>

        <BentoGrid>
          <BentoCard variant="white" span="4">
            <section className="grid gap-5">
              {filtered.map((r) => (
                <SoftCard key={r.id} className="transition hover:-translate-y-0.5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-black text-[#3A2117]">{r.customerName}</h2>
                    <span
                      className={`rounded-full px-4 py-2 text-xs font-black ${statusStyle[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-2 font-bold text-[#7A6255]">{r.phone}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updateStatus(r.id, "مقبول")}
                    className="flex items-center gap-2 rounded-2xl bg-green-50 px-5 py-3 text-sm font-black text-green-700"
                  >
                    <Check className="h-4 w-4" />
                    قبول
                  </button>
                  <button
                    onClick={() => updateStatus(r.id, "مرفوض")}
                    className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                  >
                    <X className="h-4 w-4" />
                    رفض
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="text-xs font-black text-[#7A6255]">نوع الحجز</p>
                  <h3 className="mt-1 font-black text-[#3A2117]">{r.type}</h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                    <Users className="h-4 w-4" />
                    عدد الأشخاص
                  </p>
                  <h3 className="mt-1 font-black text-[#3A2117]">{r.guests}</h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                    <CalendarDays className="h-4 w-4" />
                    التاريخ
                  </p>
                  <h3 className="mt-1 font-black text-[#3A2117]">{r.date}</h3>
                </div>
                <div className="rounded-2xl bg-[#F8F4EF] p-4">
                  <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
                    <Clock className="h-4 w-4" />
                    الوقت
                  </p>
                  <h3 className="mt-1 font-black text-[#3A2117]">{r.time}</h3>
                </div>
              </div>

              {r.notes ? (
                <div className="mt-4 rounded-2xl bg-[#FFF8EF] p-4 text-sm font-bold text-[#7A6255]">
                  ملاحظات: {r.notes}
                </div>
              ) : null}
                </SoftCard>
              ))}

              {filtered.length === 0 ? (
                <SoftCard className="text-center">
                  <h2 className="text-2xl font-black">لا توجد حجوزات</h2>
                  <p className="mt-2 text-[#7A6255]">جرّب تغيير البحث أو الفلتر.</p>
                </SoftCard>
              ) : null}
            </section>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}
