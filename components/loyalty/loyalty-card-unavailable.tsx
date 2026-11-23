"use client";

import { PublicServiceUnavailable } from "@/components/public-service-unavailable";

export function LoyaltyCardUnavailable() {
  return <PublicServiceUnavailable title="بطاقة الولاء غير متاحة حاليًا">
    <p className="mt-3 leading-7">تحقّق من رابط البطاقة لدى الفرع أو أعد المحاولة لاحقًا</p>
    <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-12 rounded-xl border border-[#CFAB76] px-6 font-bold text-[#CFAB76] focus-visible:outline-2">
      إعادة محاولة فتح البطاقة
    </button>
  </PublicServiceUnavailable>;
}
