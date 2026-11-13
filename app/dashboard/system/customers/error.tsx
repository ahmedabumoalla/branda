"use client";export default function Error({reset}:{reset:()=>void}){return <div dir="rtl" role="alert"><p>تعذر تحميل العملاء</p><button onClick={reset}>إعادة المحاولة</button></div>;}
