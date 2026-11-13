'use client';
export default function Error({reset}:{reset:()=>void}){return <section dir="rtl" role="alert"><p>تعذر تحميل دورات العمل</p><button onClick={reset}>إعادة المحاولة</button></section>}
