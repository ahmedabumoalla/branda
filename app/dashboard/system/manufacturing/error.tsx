"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) { return <div dir="rtl" className="p-8"><h2 className="mb-4 font-bold">تعذر تحميل بيانات التصنيع</h2><p className="mb-4">تحقق من الاتصال وصلاحية حسابك ثم أعد المحاولة</p><button type="button" onClick={reset} className="border px-5 py-3">إعادة المحاولة</button></div>; }
