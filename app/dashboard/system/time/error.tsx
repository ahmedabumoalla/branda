'use client';
export default function Error({reset}:{reset:()=>void}){return <section role="alert" dir="rtl"><p>تعذر تحميل سجلات الوقت</p><button onClick={reset}>إعادة المحاولة</button></section>}
