"use client";
export default function Error({reset}:{reset:()=>void}){return <section dir="rtl" className="p-8"><h2>تعذر تحميل الأصول</h2><button type="button" onClick={reset}>إعادة المحاولة</button></section>;}
