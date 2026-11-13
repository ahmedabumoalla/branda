"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section dir="rtl" style={{padding:24}}><p role="alert">تعذر تحميل الأقساط تحقق من الاتصال ثم أعد المحاولة</p><button onClick={reset}>إعادة المحاولة</button></section>}
