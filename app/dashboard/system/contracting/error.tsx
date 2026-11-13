"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section dir="rtl" style={{padding:32}}><h2>تعذر تحميل المقاولات</h2><p>تحقق من الاتصال والصلاحيات ثم أعد المحاولة</p><button type="button" onClick={reset} style={{minHeight:44,padding:"8px 20px"}}>إعادة المحاولة</button></section>;}
