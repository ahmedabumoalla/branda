'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section dir="rtl" className="p-8"><h2>تعذر تحميل المشتريات</h2><button onClick={reset}>إعادة المحاولة</button></section>;}
