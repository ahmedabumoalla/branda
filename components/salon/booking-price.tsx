"use client";
import { useState, useTransition } from "react";
import { setSalonBookingPriceAction } from "@/app/actions/salon";
import type { SalonBooking, SalonMode } from "@/lib/salon/types";
import { currencyByCode, formatAccountMoney } from "@/lib/currency/account-currency";

export function BookingPrice({ booking, mode, refresh }: { booking: SalonBooking; mode: SalonMode; refresh: () => Promise<void> }) {
  const [pending, transition] = useTransition();
  const [message, setMessage] = useState("");
  const { service } = booking;
  const current = service.agreedPrice ?? service.price;
  const currency = currencyByCode(booking.currencyCode);
  if (["completed", "cancelled", "rejected"].includes(booking.status)) return <p>سعر الحجز {current == null ? "غير محدد" : formatAccountMoney(current, booking.currencyCode)}</p>;
  return <form className="my-3 flex flex-wrap items-end gap-2" onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const price = Number(new FormData(event.currentTarget).get("price"));
    setMessage("");
    transition(async () => {
      try {
        const result = await setSalonBookingPriceAction(booking.id, booking.version, service.priceRevision ?? 0, price, mode);
        setMessage(result.ok ? "تم حفظ سعر الحجز" : result.error);
        await refresh();
      } catch { setMessage("تعذر التحقق من حفظ السعر حدّث الحجوزات"); }
    });
  }}>
    <label className="grid gap-1 text-sm">سعر الحجز ({currency.currencyName})
      <input key={service.priceRevision ?? 0} className="min-h-11 w-32 rounded-lg border px-3" name="price" type="number" inputMode="decimal"
        step="0.01" min="0" max="9999999.99" defaultValue={current ?? ""} required disabled={pending} />
    </label>
    <button className="min-h-11 rounded-lg border px-3 text-sm" disabled={pending}>{pending ? "جارٍ الحفظ" : "حفظ السعر"}</button>
    {message && <p role="status" className="w-full text-sm">{message}</p>}
  </form>;
}
