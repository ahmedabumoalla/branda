"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div dir="rtl" className="space-y-4 p-8"><p role="alert">تعذر تحميل التقييمات تحقق من الاتصال وحاول مجددًا</p><button type="button" onClick={reset} className="min-h-11 rounded-xl bg-[#4A281D] px-5 text-white">إعادة المحاولة</button></div>; }
