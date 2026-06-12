"use client";

import { CalendarDays, Clock, Search, Store, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminInput, AdminPageShell, BentoCard, BentoGrid, StatusBadge } from "@/components/ui/design-system";
import type { AdminReservationMonitorItem } from "@/lib/data/reservations";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function waitLabel(minutes: number) {
  if (minutes <= 0) return "-";
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ساعة و ${rest} دقيقة` : `${hours} ساعة`;
}

function statusTone(status: string): "success" | "warning" | "danger" {
  if (status === "مقبول") return "success";
  if (status === "مرفوض") return "danger";
  if (status === "طلب تعديل") return "warning";
  return "warning";
}

export function AdminReservationsMonitorPage({ reservations, configError }: { reservations: AdminReservationMonitorItem[]; configError?: string }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => reservations.filter((item) => [item.cafeName, item.customerName, item.phone, item.type, item.serviceName, item.status].some((value) => (value ?? "").includes(query))), [reservations, query]);
  const pending = reservations.filter((item) => item.status === "بانتظار الرد").length;
  const rejected = reservations.filter((item) => item.status === "مرفوض").length;

  return <AdminPageShell title="مراقبة الحجوزات" subtitle="متابعة الحجوزات الواردة على المنصة ومعرفة تأخر رد العلامات التجارية">
    {configError ? <p className="mb-5 font-black text-red-300">{configError}</p> : null}
    <BentoGrid className="mb-6">
      <BentoCard variant="dark"><Store className="mb-3 h-7 w-7 text-[#D9A33F]" /><p className="text-sm font-black text-[#CBB29C]">إجمالي الحجوزات</p><p className="mt-2 text-3xl font-black text-white">{reservations.length}</p></BentoCard>
      <BentoCard variant="dark"><Clock className="mb-3 h-7 w-7 text-[#D9A33F]" /><p className="text-sm font-black text-[#CBB29C]">بانتظار رد العلامة</p><p className="mt-2 text-3xl font-black text-white">{pending}</p></BentoCard>
      <BentoCard variant="dark"><CalendarDays className="mb-3 h-7 w-7 text-[#D9A33F]" /><p className="text-sm font-black text-[#CBB29C]">مرفوضة</p><p className="mt-2 text-3xl font-black text-white">{rejected}</p></BentoCard>
    </BentoGrid>
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="relative"><Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#CBB29C]" /><AdminInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالعلامة أو العميل أو الحالة" className="pr-12 text-white placeholder:text-[#A98E7A]" /></div>
    </div>
    <div className="grid gap-4">
      {filtered.map((item) => <article key={item.id} className="rounded-[26px] border border-white/10 bg-[#17100d] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-black text-[#D9A33F]">{item.cafeName}</p>
            <h2 className="mt-1 text-xl font-black text-white">{item.serviceName || item.type}</h2>
            <p className="mt-2 text-sm font-bold text-[#CBB29C]">العميل {item.customerName} • {item.phone}</p>
          </div>
          <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          <Info icon={CalendarDays} label="تاريخ الطلب" value={formatDateTime(item.createdAt)} />
          <Info icon={CalendarDays} label="تاريخ الحجز المطلوب" value={`${item.date} • ${item.time}`} />
          <Info icon={Users} label="عدد الأشخاص" value={String(item.guests)} />
          <Info icon={Clock} label="مدة الانتظار" value={waitLabel(item.pendingMinutes)} danger={item.pendingMinutes >= 60} />
          <Info icon={Store} label="الفرع" value={item.branchName || "-"} />
        </div>
        {item.rejectionReason ? <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm font-black text-red-200">سبب الرفض: {item.rejectionReason}</p> : null}
        {item.cafeMessage && !item.rejectionReason ? <p className="mt-4 rounded-2xl border border-[#D9A33F]/20 bg-[#D9A33F]/10 p-4 text-sm font-black text-[#F6C35B]">رسالة العلامة: {item.cafeMessage}</p> : null}
      </article>)}
      {!filtered.length ? <BentoCard variant="dark" span="4"><p className="py-8 text-center font-black text-[#CBB29C]">لا توجد حجوزات مطابقة</p></BentoCard> : null}
    </div>
  </AdminPageShell>;
}

function Info({ icon: Icon, label, value, danger }: { icon: React.ElementType; label: string; value: string; danger?: boolean }) { return <div className="rounded-2xl bg-white/5 p-4"><p className="flex items-center gap-2 text-xs font-black text-[#CBB29C]"><Icon className="h-4 w-4" />{label}</p><p className={`mt-2 text-sm font-black ${danger ? "text-red-300" : "text-white"}`}>{value}</p></div>; }
