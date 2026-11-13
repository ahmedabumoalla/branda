'use client';
export default function ErrorView({reset}:{reset:()=>void}){return <section dir="rtl" style={{padding:24}}><h2>تعذر تحميل أوامر الشغل</h2><button onClick={reset}>إعادة المحاولة</button></section>}
