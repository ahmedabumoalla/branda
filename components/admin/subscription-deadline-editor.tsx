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
  const [value, setValue] = useState(saudiDeadlineInput(cafe.planExpiresAtExact));
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  let parsed: string | null = null;
  try { if (value) parsed = parseSaudiDeadline(value); } catch { /* Keep editable input until it is valid. */ }
  const editable = cafe.subscriptionExpiryEditable && cafe.subscriptionId && cafe.subscriptionUpdatedAt;
  async function submit(refresh = false) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setPending(true); onBusyChange(true); setError(""); setMessage("");
    try {
      const result = refresh ? await refreshSubscriptionDeadlineAction(cafe.id) : await updateSubscriptionDeadlineAction({ cafeId: cafe.id, subscriptionId: cafe.subscriptionId, expectedUpdatedAt: cafe.subscriptionUpdatedAt, localDeadline: value });
      if (!result.ok) { setError(result.message); return; }
      setValue(saudiDeadlineInput(result.data.planExpiresAtExact));
      onUpdated({ ...cafe, ...result.data });
      setMessage(refresh ? "تم تحديث بيانات الاشتراك" : `تم حفظ موعد الانتهاء إلى ${formatSaudiDeadline(result.data.planExpiresAtExact)} بتوقيت السعودية`);
    } catch { setError("تعذر تأكيد الحفظ حدّث بيانات الاشتراك للتحقق من موعده الحالي"); }
    finally { inFlight.current = false; setPending(false); onBusyChange(false); }
  }
  return <section className={s.editor} aria-labelledby={`${fieldId}-title`} aria-busy={pending}>
    <h3 id={`${fieldId}-title`}><CalendarClock aria-hidden="true" />تعديل موعد الانتهاء</h3>
    <p>غيّر نهاية الاشتراك الحالي مع بقاء الباقة والسعر والمدة الأساسية كما هي</p>
    {editable ? <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label htmlFor={fieldId}>تاريخ وساعة الانتهاء</label>
      <div className={s.controls}><input id={fieldId} type="datetime-local" step="60" dir="ltr" required value={value} disabled={disabled || pending} aria-describedby={`${fieldId}-zone ${fieldId}-preview`} onChange={event => { setValue(event.target.value); setNow(Date.now()); setMessage(""); setError(""); }} />
        <button type="submit" disabled={disabled || pending || !parsed || value === saudiDeadlineInput(cafe.planExpiresAtExact)}>{pending ? "جار الحفظ" : "حفظ موعد الانتهاء"}</button></div>
      <small id={`${fieldId}-zone`}>التاريخ والوقت بتوقيت السعودية</small>
      <p id={`${fieldId}-preview`} className={s.preview}>{parsed ? `الموعد المحدد: ${formatSaudiDeadline(parsed)}` : "اختر تاريخًا ووقتًا صحيحين"}</p>
      {parsed && Date.parse(parsed) <= now && <p className={s.warning}>هذا الموعد مضى وستنتهي صلاحية هذا الاشتراك فور الحفظ</p>}
    </form> : <p className={s.note}>{cafe.trialAwaitingDelivery ? "يمكن تعديل الموعد بعد إرسال تفاصيل الدخول وبدء التجربة" : "تعديل الموعد متاح للاشتراك الحالي الذي بدأ ولم يُلغ"}</p>}
    <button type="button" className={s.refresh} disabled={disabled || pending} onClick={() => void submit(true)}>تحديث بيانات الاشتراك</button>
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.message} role="status">{message}</p>
  </section>;
}
