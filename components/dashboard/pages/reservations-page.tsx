
"use client";

import { CalendarDays, Check, Clock, Plus, Search, Settings2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { updateReservationStatusAction } from "@/app/actions/reservations";
import { saveReservationServiceAction } from "@/app/actions/platform-upgrade";
import { BentoCard, BentoGrid, DashboardPageShell, FilterBar, NeumoInput, NeumoTextarea, SoftCard, StatPill } from "@/components/ui/design-system";
import { formatSar } from "@/lib/format";
import type { ReservationService } from "@/lib/data/platform-upgrade";
import { type CafeReservation, type ReservationStatus } from "@/lib/mock/reservations";

type Props = { initialReservations: CafeReservation[]; initialServices?: ReservationService[]; configError?: string };

type ActionKind = "accept" | "reject" | "modify";

export function ReservationsPageClient({ initialReservations, initialServices = [], configError }: Props) {
  const [reservations, setReservations] = useState<CafeReservation[]>(initialReservations);
  const [services, setServices] = useState<ReservationService[]>(initialServices);
  const [query, setQuery] = useState("");
  const [serviceName, setServiceName] = useState("حجز طاولة");
  const [serviceDescription, setServiceDescription] = useState("حجز عادي داخل الفرع");
  const [servicePrice, setServicePrice] = useState("");
  const [serviceFree, setServiceFree] = useState(true);
  const [serviceGuests, setServiceGuests] = useState("");
  const [serviceSlots, setServiceSlots] = useState("12:00, 18:00, 21:00");
  const [actionTarget, setActionTarget] = useState<{ id: string; kind: ActionKind } | null>(null);
  const [cafeMessage, setCafeMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => reservations.filter((r) => r.customerName.includes(query) || r.phone.includes(query) || r.type.includes(query) || (r.eventTitle?.includes(query) ?? false)), [reservations, query]);
  const pending = reservations.filter((r) => r.status === "بانتظار الرد").length;
  const accepted = reservations.filter((r) => r.status === "مقبول").length;
  const guests = reservations.reduce((sum, r) => sum + r.guests, 0);

  async function confirmAction() {
    if (!actionTarget) return;
    const statusMap: Record<ActionKind, ReservationStatus> = { accept: "مقبول", reject: "مرفوض", modify: "طلب تعديل" };
    const nextStatus = statusMap[actionTarget.kind];
    setBusy(true);
    try {
      const result = await updateReservationStatusAction(actionTarget.id, nextStatus, cafeMessage, cafeMessage);
      if (result.ok) setReservations((current) => current.map((r) => r.id === actionTarget.id ? result.reservation : r));
      setActionTarget(null); setCafeMessage("");
    } finally { setBusy(false); }
  }

  async function addService() {
    const id = await saveReservationServiceAction({
      name: serviceName,
      description: serviceDescription,
      isFree: serviceFree,
      price: serviceFree ? 0 : Number(servicePrice || 0),
      maxGuests: serviceGuests ? Number(serviceGuests) : null,
      availableSlots: serviceSlots.split(",").map((x) => x.trim()).filter(Boolean),
      active: true,
      sortOrder: services.length,
    });
    setServices((current) => [{ id, name: serviceName, description: serviceDescription, isFree: serviceFree, price: serviceFree ? 0 : Number(servicePrice || 0), maxGuests: serviceGuests ? Number(serviceGuests) : null, availableSlots: serviceSlots.split(",").map((x) => x.trim()).filter(Boolean), active: true, sortOrder: current.length }, ...current]);
  }

  return <div dir="rtl"><DashboardPageShell title="الحجوزات" subtitle="إدارة طلبات الحجز وأنواع الحجز وأسعارها وكود التأكيد">
    {configError ? <SoftCard className="mb-4 p-4 font-black text-amber-700">{configError}</SoftCard> : null}
    <BentoGrid className="mb-6"><BentoCard variant="white"><StatPill label="بانتظار الرد" value={pending} /></BentoCard><BentoCard variant="white"><StatPill label="مقبولة" value={accepted} /></BentoCard><BentoCard variant="white"><StatPill label="عدد الأشخاص" value={guests} /></BentoCard><BentoCard variant="white"><StatPill label="أنواع الحجز" value={services.length} /></BentoCard></BentoGrid>

    <BentoGrid className="mb-6"><BentoCard variant="white" span="4"><div className="flex items-center gap-2"><Settings2 className="h-6 w-6 text-[#6B3A25]" /><h2 className="text-2xl font-black">إدارة الحجوزات</h2></div><p className="mt-2 font-bold text-[#7A6255]">أضف حجز طاولة أو عيد ميلاد أو مناسبة خاصة أو أي قسم آخر مع السعر والفترات وعدد الأشخاص</p><div className="mt-5 grid gap-4 md:grid-cols-3"><NeumoInput value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="اسم نوع الحجز" /><NeumoInput value={servicePrice} onChange={(e) => setServicePrice(e.target.value)} placeholder="السعر اختياري" disabled={serviceFree} /><NeumoInput value={serviceGuests} onChange={(e) => setServiceGuests(e.target.value)} placeholder="عدد الأشخاص اختياري" /><NeumoInput value={serviceSlots} onChange={(e) => setServiceSlots(e.target.value)} placeholder="الفترات المتاحة مفصولة بفواصل" /><label className="flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black"><input type="checkbox" checked={serviceFree} onChange={(e) => setServiceFree(e.target.checked)} /> مجاني</label><button onClick={addService} className="rounded-2xl bg-[#3A2117] px-5 py-3 font-black text-white"><Plus className="inline h-4 w-4" /> إضافة نوع حجز</button></div><NeumoTextarea className="mt-4" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="وصف نوع الحجز" /><div className="mt-5 grid gap-3 md:grid-cols-3">{services.map((service) => <div key={service.id} className="rounded-2xl bg-[#F8F4EF] p-4"><h3 className="font-black">{service.name}</h3><p className="mt-1 text-sm font-bold text-[#7A6255]">{service.description}</p><p className="mt-2 font-black text-[#6B3A25]">{service.isFree ? "مجاني" : formatSar(service.price ?? 0)}</p><p className="text-xs font-bold text-[#7A6255]">الفترات {service.availableSlots.join("، ") || "غير محدد"}</p></div>)}</div></BentoCard></BentoGrid>

    <FilterBar><div className="relative flex-1"><Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7A6255]" /><NeumoInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم العميل أو الجوال أو نوع الحجز" className="pr-12" /></div></FilterBar>
    <BentoGrid><BentoCard variant="white" span="4"><section className="grid gap-5">{filtered.map((r) => <SoftCard key={r.id}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-2xl font-black text-[#3A2117]">{r.customerName}</h2><p className="mt-1 font-bold text-[#7A6255]">{r.phone}</p><p className="mt-1 font-bold text-[#7A6255]">{r.type} • {r.date} • {r.time}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setActionTarget({ id: r.id, kind: "accept" })} className="rounded-xl bg-green-100 px-4 py-2 font-black text-green-700"><Check className="inline h-4 w-4" /> قبول</button><button onClick={() => setActionTarget({ id: r.id, kind: "modify" })} className="rounded-xl bg-blue-100 px-4 py-2 font-black text-blue-700"><Clock className="inline h-4 w-4" /> تعديل</button><button onClick={() => setActionTarget({ id: r.id, kind: "reject" })} className="rounded-xl bg-red-100 px-4 py-2 font-black text-red-700"><X className="inline h-4 w-4" /> رفض</button></div></div><div className="mt-4 grid gap-3 md:grid-cols-4"><Info label="الأشخاص" value={String(r.guests)} icon={Users} /><Info label="الفرع" value={r.branchName || "-"} /><Info label="الحالة" value={r.status} /><Info label="ملاحظات" value={r.notes || "-"} /></div></SoftCard>)}</section></BentoCard></BentoGrid>
  </DashboardPageShell>{actionTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md rounded-[28px] bg-[#FDFBF8] p-6 shadow-xl"><h3 className="text-xl font-black text-[#3A2117]">تأكيد إجراء الحجز</h3><NeumoTextarea value={cafeMessage} onChange={(e) => setCafeMessage(e.target.value)} placeholder="رسالة للعميل" className="mt-4 h-28" /><div className="mt-4 flex gap-2"><button disabled={busy} onClick={confirmAction} className="flex-1 rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8F4EF]">تأكيد</button><button onClick={() => setActionTarget(null)} className="rounded-2xl bg-[#F8F4EF] px-4 py-3 font-black text-[#3A2117]">إلغاء</button></div></div></div> : null}</div>;
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) { return <div className="rounded-2xl bg-[#F8F4EF] p-4"><p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">{Icon ? <Icon className="h-4 w-4" /> : null}{label}</p><h3 className="mt-1 font-black text-[#3A2117]">{value}</h3></div>; }
