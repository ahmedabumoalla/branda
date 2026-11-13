"use client";
export default function StoreError({reset}:{reset:()=>void}) { return <section dir="rtl" role="alert" style={{padding:28}}><h1>تعذر فتح المتجر الإلكتروني</h1><p>تحقق من اتصالك وصلاحية الوصول ثم أعد المحاولة</p><button type="button" onClick={reset}>إعادة المحاولة</button></section>; }
