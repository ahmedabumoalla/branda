"use client";
export default function AttendanceError({reset}:{reset:()=>void}){return <div dir="rtl" className="p-8"><p>تعذر تحميل الحضور تحقق من صلاحياتك ثم أعد المحاولة</p><button type="button" onClick={reset}>إعادة المحاولة</button></div>;}
