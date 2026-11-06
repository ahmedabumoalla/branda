"use client";

import { useId, useRef, useState } from "react";
import { CalendarClock } from "lucide-react";
import { refreshSubscriptionDeadlineAction, updateSubscriptionDeadlineAction } from "@/app/actions/admin-subscription-deadline";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import { formatSaudiDeadline, parseSaudiDeadline, saudiDeadlineInput } from "@/lib/platform/subscription-deadline";
import s from "./subscription-deadline-editor.module.css";

export function SubscriptionDeadlineEditor({ cafe, disabled, onUpdated, onBusyChange }: {
  cafe: PlatformCafe; disabled: boolean; onUpdated: (cafe: PlatformCafe) => void; onBusyChange: (busy: boolean) => void;
}) {
  const fieldId = useId();
  const [value, setValue] = useState(cafe.subscriptionExpiryMixed ? "" : saudiDeadlineInput(cafe.planExpiresAtExact));
  const [inputRevision, setInputRevision] = useState(cafe.subscriptionRevision);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  let parsed: string | null = null;
  try { if (value) parsed = parseSaudiDeadline(value); } catch { /* Keep editable input until it is valid. */ }
  const editable = cafe.subscriptionExpiryEditable && !cafe.trialAwaitingDelivery && !!cafe.subscriptionRevision;
  const stale = inputRevision !== cafe.subscriptionRevision;
  const unchanged = !cafe.subscriptionExpiryMixed && value === saudiDeadlineInput(cafe.planExpiresAtExact);
  async function submit(refresh = false) {
    if (inFlight.current || disabled || (!refresh && (!editable || !parsed || unchanged || stale))) return;
    inFlight.current = true; setPending(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const result = refresh ? await refreshSubscriptionDeadlineAction(cafe.id) : await updateSubscriptionDeadlineAction({ cafeId: cafe.id, expectedRevision: cafe.subscriptionRevision, localDeadline: value });
      if (!result.ok) { setError(result.message); return; }
      setValue(result.data.subscriptionExpiryMixed ? "" : saudiDeadlineInput(result.data.planExpiresAtExact));
      setInputRevision(result.data.subscriptionRevision);
      onUpdated({ ...cafe, ...result.data });
      setMessage(refresh ? "تم تحديث بيانات الاشتراك" : `تم توحيد موعد انتهاء جميع الباقات إلى ${formatSaudiDeadline(result.data.planExpiresAtExact)} بتوقيت السعودية`);
    } catch { setError("تعذر تأكيد الحفظ حدّث بيانات الاشتراك للتحقق من موعده الحالي"); }
    finally { inFlight.current = false; setPending(false); onBusyChange(false); }
  }
  return <section className={s.editor} aria-labelledby={`${fieldId}-title`} aria-busy={pending}>
    <h3 id={`${fieldId}-title`}><CalendarClock aria-hidden="true" />موعد انتهاء جميع الباقات</h3>
    <p>حدد تاريخًا ووقتًا واحدًا لتطبيقه على جميع باقات العلامة الحالية</p>
    {cafe.subscriptionExpiryMixed && <p className={s.warning}>الباقات الحالية تنتهي في مواعيد مختلفة حفظ موعد جديد يوحّد نهايتها جميعًا</p>}
    {stale && <p className={s.warning} role="status">تغيرت بيانات الاشتراك حدّثها قبل تعديل موعد الانتهاء</p>}
    {editable ? <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor={fieldId}>تاريخ وساعة الانتهاء</label>
      <div className={s.controls}><input id={fieldId} type="datetime-local" step="60" dir="ltr" required value={value} disabled={disabled || pending || stale} aria-describedby={`${fieldId}-zone ${fieldId}-preview`} onChange={event => { setValue(event.target.value); setNow(Date.now()); setMessage(""); setError(""); }} />
        <button type="submit" disabled={disabled || pending || !parsed || unchanged || stale}>{pending ? "جار الحفظ" : "حفظ الموعد لجميع الباقات"}</button></div>
      <small id={`${fieldId}-zone`}>التاريخ والوقت بتوقيت السعودية</small>
      <p id={`${fieldId}-preview`} className={s.preview}>{parsed ? `الموعد المحدد: ${formatSaudiDeadline(parsed)}` : "اختر تاريخًا ووقتًا صحيحين"}</p>
      {parsed && Date.parse(parsed) <= now && <p className={s.warning}>هذا الموعد مضى وستنتهي صلاحية جميع الباقات الحالية فور الحفظ</p>}
    </form> : <p className={s.note}>{cafe.trialAwaitingDelivery ? "يبدأ عدّاد جميع الباقات بعد إرسال تفاصيل الدخول ويمكن تعديل الموعد بعد بدء التجربة" : "تعديل الموعد متاح للباقات الحالية التي بدأت ولم تُلغ"}</p>}
    <button type="button" className={s.refresh} disabled={disabled || pending} onClick={() => void submit(true)}>تحديث بيانات الاشتراك</button>
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.message} role="status">{message}</p>
  </section>;
}
