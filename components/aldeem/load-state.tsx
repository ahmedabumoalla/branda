"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Action, aldeem as s } from "./aldeem-ui";

/** Shown when a section cannot be read: says why and offers one clear way forward */
export function AldeemLoadState({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <main className={s.page} dir="rtl">
    <div className={s.panel}><div className={s.empty} role="alert">
      <strong>{title}</strong><span>{message}</span>
      <Action tone="primary" help="يعيد قراءة بيانات الصفحة من النظام" disabled={pending} onClick={() => start(() => router.refresh())}>{pending ? "جار إعادة التحميل" : "إعادة المحاولة"}</Action>
    </div></div>
  </main>;
}
