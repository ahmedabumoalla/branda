"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <section dir="rtl" style={{padding:24}}><p role="alert">تعذر تحميل الحجوزات تحقق من الاتصال وحاول مجددًا</p><button type="button" onClick={reset}>إعادة المحاولة</button></section>;}
