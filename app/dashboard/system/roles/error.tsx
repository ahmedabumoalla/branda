"use client";
export default function ErrorView({reset}:{reset:()=>void}){return <div dir="rtl" role="alert" className="p-8"><h2>تعذر عرض الأدوار تحقق من صلاحية مالك العلامة</h2><button className="mt-4 rounded border p-3" onClick={reset}>إعادة المحاولة</button></div>;}
