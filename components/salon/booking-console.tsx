"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { BellRing, Check, RefreshCw, Scissors, Star } from "lucide-react";
import { DashboardPageShell } from "@/components/ui/design-system";
import { commandSalonBookingAction, fetchSalonBookingsAction } from "@/app/actions/salon";
import { bookingLabels, salonInputTime, salonTime, type SalonBooking, type SalonCommand, type SalonFilter, type SalonMode, type SalonPage } from "@/lib/salon/types";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5D8CD] bg-white text-[#3A2117] px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4";
const input = "min-h-11 rounded-xl border border-[#E5D8CD] bg-transparent px-3 py-2 text-sm";
export function BookingConsole({ initial, mode = "owner", pager = false, initialBooking, brandName }: { initial: SalonPage; mode?: SalonMode; pager?: boolean; initialBooking?: string; brandName?: string }) {
  const [page, setPage] = useState(initial);
  const [filter, setFilter] = useState<SalonFilter>({ status: pager ? "active" : "all", booking: initialBooking });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, transition] = useTransition();
  const [proposal, setProposal] = useState<Record<string, string>>({});
  const request = useRef(0);
  const mutationLock = useRef(false);
  const refresh = useCallback(async (next: SalonFilter, silent = false) => {
    const sequence = ++request.current;
    const result = await fetchSalonBookingsAction(next, mode, pager);
    if (sequence !== request.current) return;
    if (result.ok) { setPage(result.data); if (!silent) setError(""); } else setError(result.error);
  }, [mode, pager]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden && !mutationLock.current) void refresh(filter, true); }, 30000);
    return () => clearInterval(timer);
  }, [filter, refresh]);
  function change(next: SalonFilter) { setFilter(next); transition(() => refresh(next)); }
  function command(booking: SalonBooking, action: SalonCommand) {
    if (mutationLock.current) return;
    let start: string | null = null;
    if (action === "propose") { try { start = salonInputTime(proposal[booking.id] || ""); } catch { setError("حدد الموعد البديل أولًا"); return; } }
    mutationLock.current = true; setError(""); setNotice("");
    transition(async () => {
      try {
        const result = await commandSalonBookingAction(booking.id, booking.version, action, start, mode);
        if (!result.ok) setError(result.error);
        else { setNotice(action === "call" ? "تم تسجيل النداء وجدولة رسالة واتساب واحدة" : action === "complete" ? "اكتملت الخدمة وتمت جدولة رابط التقييم وبطاقة الولاء" : "تم حفظ ردك وإشعار العميل"); await refresh(filter, true); }
      } finally { mutationLock.current = false; }
    });
  }
  const tabs: { value: SalonFilter["status"]; label: string }[] = pager ? [{ value: "active", label: "المواعيد المؤكدة" }, { value: "reviews", label: "تقييمات العملاء" }, { value: "completed", label: "الخدمات المكتملة" }] : [{ value: "all", label: "كل الحجوزات" }, { value: "pending", label: "طلبات جديدة" }, { value: "confirmed", label: "الجدول المؤكد" }, { value: "proposed", label: "بانتظار العميل" }, { value: "rejected", label: "الحجوزات المرفوضة" }];
  return <DashboardPageShell title={pager ? "نظام البيجر" : "متابعة الحجوزات"} subtitle={brandName ? `${brandName} — ${pager ? "متابعة الخدمة وتقييمات العملاء" : "طلبات الحجز والمواعيد المؤكدة"}` : undefined} action={<button className={button} disabled={pending} onClick={() => transition(() => refresh(filter))}><RefreshCw size={16} aria-hidden="true" /> تحديث</button>}><section dir="rtl" className="space-y-6">
    <nav className="flex flex-wrap gap-2" aria-label="تصفية الحجوزات">{tabs.map(tab => <button key={tab.value} className={`${button} ${filter.status === tab.value ? "!bg-[#4A281D] !text-[#FCF8F3]" : ""}`} aria-pressed={filter.status === tab.value} disabled={pending} onClick={() => change({ ...filter, status: tab.value, page: 0, booking: undefined })}>{tab.label}</button>)}</nav>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-xs">التاريخ بتوقيت السعودية<input className={input} type="date" value={filter.date ?? ""} disabled={pending} onChange={e => change({ ...filter, date: e.target.value || undefined, page: 0 })} /></label>{(filter.date || filter.booking) && <button className={button} disabled={pending} onClick={() => change({ ...filter, date: undefined, booking: undefined, page: 0 })}>إزالة التصفية</button>}<span className="pb-3 text-xs opacity-65">{page.total} حجز</span></div>
    {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</p>}{notice && <p role="status" className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm">{notice}</p>}
    {!page.bookings.length ? <div className="rounded-2xl border border-dashed border-[#E5D8CD] p-12 text-center"><Scissors className="mx-auto mb-4 opacity-50" aria-hidden="true" /><h2 className="font-semibold">لا توجد حجوزات في هذه القائمة</h2><p className="mt-2 text-sm opacity-65">{pager ? "تظهر المواعيد هنا بعد تأكيدها من متابعة الحجوزات" : "ستظهر طلبات العملاء هنا عند الحجز من صفحة الصالون"}</p></div> : <div className="grid gap-4">{page.bookings.map(booking => <article key={booking.id} className="rounded-2xl border border-[#E5D8CD] bg-white text-[#3A2117] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{booking.customerName}</h2><p className="mt-1 text-sm opacity-65">{booking.service.name || "تحديد الخدمة مع العميل"}</p></div><span className="rounded-full border border-[#E5D8CD] px-3 py-1 text-xs">{bookingLabels[booking.status]}</span></div>
      <dl className="my-4 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="mb-1 text-xs opacity-60">{booking.scheduledStart ? "الموعد المؤكد" : "الموعد المطلوب"}</dt><dd>{salonTime(booking.scheduledStart || booking.requestedStart)}</dd></div>{booking.proposedStart && <div><dt className="mb-1 text-xs opacity-60">الموعد المقترح</dt><dd>{salonTime(booking.proposedStart)}</dd></div>}<div><dt className="mb-1 text-xs opacity-60">رقم العميل</dt><dd dir="ltr" className="text-right">{booking.phone}</dd></div></dl>
      {!pager && booking.status === "pending" && <div className="space-y-4 border-t border-[#E5D8CD] pt-4"><div className="flex flex-wrap gap-2"><button className={button} disabled={pending} onClick={() => command(booking, "confirm")}><Check size={16} aria-hidden="true" /> تأكيد الموعد</button><button className={button} disabled={pending} onClick={() => command(booking, "reject")}>رفض الحجز</button></div><div className="flex flex-wrap items-end gap-2"><label className="grid gap-2 text-xs">اقتراح تاريخ ووقت آخر<input type="datetime-local" className={input} value={proposal[booking.id] ?? ""} disabled={pending} onChange={e => setProposal({ ...proposal, [booking.id]: e.target.value })} /></label><button className={button} disabled={pending || !proposal[booking.id]} onClick={() => command(booking, "propose")}>إرسال الموعد للعميل</button></div></div>}
      {pager && booking.status === "confirmed" && <button className={button} disabled={pending} onClick={() => command(booking, "call")}><BellRing size={16} aria-hidden="true" /> نداء العميل</button>}
      {pager && booking.status === "in_service" && <div className="flex flex-wrap items-center gap-3"><span className="text-xs opacity-65">تم النداء {salonTime(booking.calledAt)}</span><button className={button} disabled={pending} onClick={() => command(booking, "complete")}><Check size={16} aria-hidden="true" /> انتهت الخدمة</button></div>}
      {booking.rating != null && <div className="mt-4 border-t border-[#E5D8CD] pt-4"><p className="flex items-center gap-2 text-sm"><Star size={16} aria-hidden="true" /> تقييم العميل {booking.rating} من 5</p>{booking.review && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 opacity-80">{booking.review}</p>}</div>}
    </article>)}</div>}
    {page.total > 30 && <div className="flex items-center justify-center gap-4"><button className={button} disabled={pending || page.page === 0} onClick={() => change({ ...filter, page: page.page - 1 })}>السابق</button><span className="text-sm">{page.page + 1} / {Math.ceil(page.total / 30)}</span><button className={button} disabled={pending || (page.page + 1) * 30 >= page.total} onClick={() => change({ ...filter, page: page.page + 1 })}>التالي</button></div>}
  </section></DashboardPageShell>;
}
