"use client";

export default function FinanceError({ reset }: { reset: () => void }) {
  return <div dir="rtl" role="alert" className="m-6 rounded-2xl border border-[#E6DACB] bg-[#FFFDF9] p-8 text-[#39251B]"><h1 className="text-xl font-bold">تعذر تحميل المالية</h1><p className="mt-3 text-sm leading-7">تحقق من اتصالك وصلاحية الباقة ثم أعد المحاولة</p><button onClick={reset} className="mt-5 min-h-11 rounded-xl bg-[#39251B] px-6 py-3 text-sm font-bold text-white">إعادة المحاولة</button></div>;
}
