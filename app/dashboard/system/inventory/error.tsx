'use client';
export default function Error({reset}:{reset:()=>void}){return <section dir="rtl" role="alert" style={{padding:24}}><h2>تعذر تحميل المخزون</h2><button onClick={reset}>إعادة المحاولة</button></section>;}
