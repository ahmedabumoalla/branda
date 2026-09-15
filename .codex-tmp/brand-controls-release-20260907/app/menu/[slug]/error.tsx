"use client";

export default function MenuError({ reset }: { reset: () => void }) {
  return <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-[#111310] px-6 text-center text-[#F3EEE3]">
    <h1 className="text-2xl font-bold">تعذر تحميل المنيو</h1>
    <p>تحقق من اتصالك وحاول مرة أخرى</p>
    <button onClick={reset} className="min-h-12 rounded-full bg-[#CFAB76] px-8 py-3 text-[#111310]">إعادة المحاولة</button>
  </main>;
}
