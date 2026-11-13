"use client";
import { useState, useTransition } from "react";
import { savePagerGoogleReviewAction } from "@/app/actions/pager-reviews";
import s from "./customer-directory.module.css";
export function GoogleReviewSettings({ initialUrl }: { initialUrl: string }) {
  const [url,setUrl] = useState(initialUrl), [error,setError] = useState(""), [saved,setSaved] = useState(false);
  const [pending,startTransition] = useTransition();
  return <form className={`${s.panel} ${s.settings}`} onSubmit={event=>{event.preventDefault();setError("");setSaved(false);startTransition(async()=>{try {const result=await savePagerGoogleReviewAction(url); if(!result.ok){setError(result.error);return;}setUrl(result.url);setSaved(true);}catch {setError("تعذر حفظ الرابط تحقق من الاتصال وحاول مجددًا");}});}}>
    <h2>تقييم العلامة على قوقل ماب</h2><p className={s.muted}>من ملف نشاطك التجاري في قوقل افتح قراءة المراجعات ثم الحصول على مزيد من المراجعات وانسخ رابط التقييم هنا</p>
    <label>رابط كتابة التقييم<input className={s.input} type="url" dir="ltr" maxLength={2048} value={url} disabled={pending} onChange={event=>{setUrl(event.target.value);setSaved(false);}} placeholder="https://g.page/r/…/review" /></label>
    <p className={s.muted}>يظهر زر قوقل لكل عميل بعد حفظ تقييمه هنا ويكتب العميل مراجعته بنفسه في قوقل ولا تنتقل المراجعة الداخلية تلقائيًا اترك الرابط فارغًا لإيقاف الزر</p>
    <div><button type="submit" className={s.button} disabled={pending}>{pending ? "جار الحفظ" : "حفظ رابط التقييم"}</button></div>{error && <p role="alert" className={s.error}>{error}</p>}{saved && <p role="status" className={s.success}>تم حفظ إعداد رابط التقييم</p>}
  </form>;
}
