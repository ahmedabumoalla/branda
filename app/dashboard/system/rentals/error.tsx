"use client";
export default function RentalError({reset}:{reset:()=>void}){return <section dir="rtl"><h2>تعذر تحميل إدارة الإيجارات</h2><p>تحقق من صلاحياتك واتصالك ثم أعد المحاولة</p><button onClick={reset}>إعادة المحاولة</button></section>}
