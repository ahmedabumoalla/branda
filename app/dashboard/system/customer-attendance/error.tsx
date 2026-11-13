"use client";
export default function Error({reset}:{reset:()=>void}){return <div dir="rtl" className="p-6"><h2>تعذر تحميل حضور العملاء</h2><button className="min-h-11 border px-4" onClick={reset}>إعادة المحاولة</button></div>;}
