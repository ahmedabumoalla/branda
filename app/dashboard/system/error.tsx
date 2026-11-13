"use client";
import Link from "next/link";
import s from "@/components/erp/erp.module.css";
export default function SystemError({retry}:{retry:()=>void}){
 return <section dir="rtl" className={s.workspace} role="alert"><h1>تعذر تحميل بيانات القسم</h1><p>تحقق من اتصالك ثم أعد المحاولة</p><div className={s.toolbar}><button type="button" className={s.primary} onClick={()=>retry()}>إعادة المحاولة</button><Link href="/dashboard/finance" className={s.button}>العودة إلى النظام</Link></div></section>;
}
