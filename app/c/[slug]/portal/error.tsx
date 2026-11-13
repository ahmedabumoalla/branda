"use client";
export default function Error({reset}:{reset:()=>void}){return <div dir="rtl" role="alert"><p>تعذر تحميل بوابة العميل</p><button onClick={reset}>إعادة المحاولة</button></div>;}
