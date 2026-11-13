"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <div dir="rtl" className="p-8"><p>تعذر تحميل عهد الموظفين</p><button type="button" onClick={reset}>إعادة المحاولة</button></div>;}
