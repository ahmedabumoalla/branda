"use client";

import { CalendarDays, Eye, EyeOff, Pencil, Power, TicketPercent, Trash2 } from "lucide-react";
import type { CafeOffer } from "@/lib/mock/offers";

type Props = {
  offer: CafeOffer;
  onEdit: () => void;
  onToggleStatus: () => void;
  onToggleVisible: () => void;
  onDelete: () => void;
};

export function OfferCard({
  offer,
  onEdit,
  onToggleStatus,
  onToggleVisible,
  onDelete,
}: Props) {
  const isActive = offer.status === "نشط";

  return (
    <article className="rounded-3xl border border-white bg-white/80 p-6 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
            <TicketPercent className="h-7 w-7" />
          </div>

          <div>
            <p className="text-xs font-black text-[#8B5E3C]">{offer.type}</p>
            <h2 className="mt-1 text-2xl font-black text-[#3A2117]">
              {offer.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-[#7A6255]">
              {offer.description}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-4 py-2 text-xs font-black ${
            isActive
              ? "bg-green-50 text-green-700"
              : offer.status === "مجدول"
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {offer.status}
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#7A6255]">كود العرض</p>
          <h3 className="mt-1 font-black text-[#3A2117]">{offer.code || "بدون كود"}</h3>
        </div>

        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#7A6255]">قيمة الخصم</p>
          <h3 className="mt-1 font-black text-[#3A2117]">
            {offer.discountPercent ? `${offer.discountPercent}%` : "عرض خاص"}
          </h3>
        </div>

        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="flex items-center gap-1 text-xs font-black text-[#7A6255]">
            <CalendarDays className="h-4 w-4" />
            المدة
          </p>
          <h3 className="mt-1 text-sm font-black text-[#3A2117]">
            {offer.startDate} - {offer.endDate}
          </h3>
        </div>

        <div className="rounded-2xl bg-[#F8F4EF] p-4">
          <p className="text-xs font-black text-[#7A6255]">ظهور للعميل</p>
          <h3 className="mt-1 font-black text-[#3A2117]">
            {offer.visibleInCafe ? "ظاهر" : "مخفي"}
          </h3>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-[#EFE8DF] pt-5">
        <button onClick={onEdit} className="flex items-center gap-2 rounded-2xl border border-[#E5D8CD] bg-white px-5 py-3 text-sm font-black">
          <Pencil className="h-4 w-4" />
          تعديل
        </button>

        <button onClick={onToggleStatus} className="flex items-center gap-2 rounded-2xl bg-[#3A2117]/10 px-5 py-3 text-sm font-black text-[#3A2117]">
          <Power className="h-4 w-4" />
          {isActive ? "إيقاف" : "تفعيل"}
        </button>

        <button onClick={onToggleVisible} className="flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-5 py-3 text-sm font-black">
          {offer.visibleInCafe ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {offer.visibleInCafe ? "إخفاء من صفحة الكوفي" : "إظهار في صفحة الكوفي"}
        </button>

        <button onClick={onDelete} className="flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700">
          <Trash2 className="h-4 w-4" />
          حذف
        </button>
      </div>
    </article>
  );
}