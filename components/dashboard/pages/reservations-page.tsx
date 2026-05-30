"use client";

import {
  CalendarDays,
  Check,
  Clock,
  MessageSquare,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  FilterBar,
  NeumoInput,
  NeumoTextarea,
  SoftCard,
  StatPill,
} from "@/components/ui/design-system";
import {
  RESERVATIONS_KEY,
  type CafeReservation,
  type ReservationStatus,
} from "@/lib/mock/reservations";
import { updateReservationStatus } from "@/lib/platform/reservation-flow";

type Props = {
  initialReservations: CafeReservation[];
};

const statusStyle: Record<ReservationStatus, string> = {
  "بانتظار الرد": "bg-amber-50 text-amber-700",
  "مقبول": "bg-green-50 text-green-700",
  "مرفوض": "bg-red-50 text-red-700",
  "طلب تعديل": "bg-blue-50 text-blue-700",
};

type ActionKind = "accept" | "reject" | "modify";

export function ReservationsPageClient({ initialReservations }: Props) {
  const [reservations, setReservations] = useState<CafeReservation[]>(initialReservations);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReservationStatus | "الكل">("الكل");
  const [actionTarget, setActionTarget] = useState<{
    id: string;
    kind: ActionKind;
  } | null>(null);
  const [cafeMessage, setCafeMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(RESERVATIONS_KEY);
    if (saved) setReservations(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
  }, [reservations]);

  const filtered = useMemo(() => {
    return reservations.filter((r) => {
      const matchQuery =
        r.customerName.includes(query) ||
        r.phone.includes(query) ||
        r.type.includes(query) ||
        (r.eventTitle?.includes(query) ?? false);

      const matchStatus = status === "الكل" || r.status === status;

      return matchQuery && matchStatus;
    });
  }, [reservations, query, status]);

  const pendingCount = reservations.filter((r) => r.status === "بانتظار الرد").length;
  const acceptedCount = reservations.filter((r) => r.status === "مقبول").length;
  const totalGuests = reservations.reduce((sum, r) => sum + r.guests, 0);

  function openAction(id: string, kind: ActionKind) {
    setActionTarget({ id, kind });
    setCafeMessage("");
  }

  function confirmAction() {
    if (!actionTarget) return;

    const statusMap: Record<ActionKind, ReservationStatus> = {
      accept: "مقبول",
      reject: "مرفوض",
      modify: "طلب تعديل",
    };

    const nextStatus = statusMap[actionTarget.kind];
    const result = updateReservationStatus(actionTarget.id, nextStatus, {
      cafeSlug: "qatrah",
      cafeMessage: cafeMessage,
      rejectionReason: actionTarget.kind === "reject" ? cafeMessage : undefined,
    });

    if (result.ok) {
      setReservations((prev) =>
        prev.map((r) => (r.id === actionTarget.id ? result.reservation : r))
      );
    }

    setActionTarget(null);
    setCafeMessage("");
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="إدارة الحجوزات"
        subtitle="الحجوزات القادمة من صفحة الكوفي — قبول، رفض، أو طلب تعديل مع رسالة للعميل."
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
            {(["الكل", "بانتظار الرد", "مقبول", "مرفوض", "طلب تعديل"] as const).map(
              (item) => (
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
              )
            )}
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
                      {r.branchName ? (
                        <p className="mt-1 text-sm font-bold text-[#7A6255]">الفرع: {r.branchName}</p>
                      ) : null}
                    </div>

                    {r.status === "بانتظار الرد" ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openAction(r.id, "accept")}
                          className="flex items-center gap-2 rounded-2xl bg-green-50 px-5 py-3 text-sm font-black text-green-700"
                        >
                          <Check className="h-4 w-4" />
                          قبول
                        </button>
                        <button
                          onClick={() => openAction(r.id, "modify")}
                          className="flex items-center gap-2 rounded-2xl bg-blue-50 px-5 py-3 text-sm font-black text-blue-700"
                        >
                          <MessageSquare className="h-4 w-4" />
                          طلب تعديل
                        </button>
                        <button
                          onClick={() => openAction(r.id, "reject")}
                          className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700"
                        >
                          <X className="h-4 w-4" />
                          رفض
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Info label="نوع الحجز" value={r.type} />
                    <Info label="عدد الأشخاص" value={String(r.guests)} icon={Users} />
                    <Info label="التاريخ" value={r.date} icon={CalendarDays} />
                    <Info label="الوقت" value={r.time} icon={Clock} />
                  </div>

                  {(r.eventTitle || r.needsDecoration || r.needsCatering || r.budgetEstimate) && (
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {r.eventTitle ? <Info label="عنوان المناسبة" value={r.eventTitle} /> : null}
                      {r.budgetEstimate ? (
                        <Info label="الميزانية" value={`${r.budgetEstimate} ر.س`} />
                      ) : null}
                      {r.needsDecoration ? <Info label="ديكور" value="مطلوب" /> : null}
                      {r.needsCatering ? <Info label="ضيافة" value="مطلوبة" /> : null}
                    </div>
                  )}

                  {r.notes ? (
                    <div className="mt-4 rounded-2xl bg-[#FFF8EF] p-4 text-sm font-bold text-[#7A6255]">
                      ملاحظات: {r.notes}
                    </div>
                  ) : null}

                  {r.cafeMessage ? (
                    <div className="mt-4 rounded-2xl bg-[#EEF4FF] p-4 text-sm font-bold text-blue-800">
                      رسالة الكوفي: {r.cafeMessage}
                    </div>
                  ) : null}

                  {r.rejectionReason ? (
                    <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                      سبب الرفض: {r.rejectionReason}
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

      {actionTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl">
            <h3 className="text-xl font-black text-[#3A2117]">
              {actionTarget.kind === "accept"
                ? "تأكيد قبول الحجز"
                : actionTarget.kind === "reject"
                  ? "رفض الحجز"
                  : "طلب تعديل من العميل"}
            </h3>
            <p className="mt-2 text-sm font-bold text-[#7A6255]">
              {actionTarget.kind === "accept"
                ? "رسالة اختيارية للعميل (وقت بديل، تعليمات...)"
                : "اكتب رسالة للعميل تشرح السبب أو التعديل المطلوب"}
            </p>
            <NeumoTextarea
              value={cafeMessage}
              onChange={(e) => setCafeMessage(e.target.value)}
              placeholder="رسالة الكوفي للعميل..."
              className="mt-4 h-28"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmAction}
                className="flex-1 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8F4EF]"
              >
                تأكيد
              </button>
              <button
                onClick={() => setActionTarget(null)}
                className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-2xl bg-[#F8F4EF] p-4">
      <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </p>
      <h3 className="mt-1 font-black text-[#3A2117]">{value}</h3>
    </div>
  );
}
