"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main dir="rtl" style={{padding:32}}><h1>تعذر فتح القسم</h1><p>تحقق من صلاحية حسابك وتفعيل الخدمة ثم أعد المحاولة</p><button onClick={reset}>إعادة المحاولة</button></main>;}
