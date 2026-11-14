"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChefHat, RefreshCw } from "lucide-react";
import s from "./lab-workspace.module.css";

export function LabLoadState({ message }: { message?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <main className={s.page} dir="rtl"><section className={s.empty} aria-busy={!message || pending}><ChefHat size={40} aria-hidden="true" /><h1 className={s.title}>{message ? "تعذر فتح شاشة المعمل" : "جار تحميل طلبات المعمل"}</h1><p role={message ? "alert" : "status"}>{message || "نجهز لك الطلبات وحالات التجهيز والسداد"}</p>{message && <button className={s.primary} disabled={pending} onClick={() => startTransition(() => router.refresh())}><RefreshCw size={17} aria-hidden="true" />{pending ? "جار التحديث" : "إعادة المحاولة"}</button>}</section></main>;
}
