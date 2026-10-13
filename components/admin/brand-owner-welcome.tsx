"use client";
import { useRef, useState } from "react";
import { Check, LoaderCircle, Send } from "lucide-react";
import { refreshAdminBrandAction, sendBrandOwnerWelcomeAction } from "@/app/actions/admin-brand-onboarding";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import s from "./brand-onboarding.module.css";
import { BrandOwnerEditor } from "./brand-owner-editor";

export function BrandOwnerWelcome({ cafe, disabled, onBusyChange, onUpdated }: { cafe: PlatformCafe; disabled: boolean; onBusyChange: (value: boolean) => void; onUpdated: (cafe: PlatformCafe) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const inFlight = useRef(false);
  const delivery = cafe.ownerDelivery;
  if (!delivery) return null;
  async function refresh() {
    const result = await refreshAdminBrandAction(cafe.id);
    if (result.ok) onUpdated(result.data); else setError(result.message);
  }
  async function send() {
    if (inFlight.current || disabled || delivery?.state === "sent") return;
    inFlight.current = true; setPending(true); onBusyChange(true); setError("");
    try {
      const result = await sendBrandOwnerWelcomeAction(cafe.id, retryConfirmed);
      if (result.ok) onUpdated(result.data);
      else { setError(result.message); await refresh(); }
    } catch { setError("انقطع الاتصال حدّث حالة الإرسال قبل المحاولة مجددًا"); }
    finally { inFlight.current = false; setPending(false); onBusyChange(false); setRetryConfirmed(false); }
  }
  if (delivery.state === "sent") return <section className={s.welcome} role="status"><h3><Check size={19} aria-hidden="true" />تم إرسال تفاصيل الدخول للمالك</h3><p>بدأت التجربة لمدة ٧ أيام من وقت الإرسال</p>{delivery.sentAt && <time dateTime={delivery.sentAt}>{new Date(delivery.sentAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" })}</time>}</section>;
  return <section className={s.welcome} aria-busy={pending}>
    <h3>تسليم الحساب للمالك</h3>
    <p>تقدر تدخل بوضع الصيانة وتجهّز العلامة الآن ومدة التجربة لم تبدأ بعد</p>
    <div className={s.recipient}><span>{cafe.ownerPhone ? "ستصل بيانات الدخول إلى واتساب" : "رقم جوال المالك لم يُضف بعد"}</span>{cafe.ownerPhone && <bdi>{cafe.ownerPhone}</bdi>}</div>
    <p className={s.preview}>رسالة مختصرة تتضمن رابط برندة ورابط الدخول ورقم الجوال وكلمة المرور التي حددتها</p>
    {delivery.state === "uncertain" && <label className={s.retry}><input type="checkbox" checked={retryConfirmed} onChange={event => setRetryConfirmed(event.target.checked)} disabled={pending} /><span>قد تكون الرسالة السابقة وصلت أوافق على إعادة إرسالها لبدء التجربة</span></label>}
    {delivery.state === "sending" && <p role="status">جارٍ التحقق من الإرسال حدّث الحالة بعد قليل</p>}
    {delivery.state === "editing" && <p role="status">هناك حفظ غير مكتمل افتح بيانات المالك وأعد حفظها قبل الإرسال</p>}
    {!delivery.detailsReady && <p className={s.note}>أكمل اسم المالك ورقم الجوال وكلمة المرور قبل الإرسال البريد الإلكتروني اختياري</p>}
    {(delivery.state === "ready" || delivery.state === "editing") && (editing ? <BrandOwnerEditor cafe={cafe} disabled={disabled || pending} onBusyChange={onBusyChange} onSaved={onUpdated} close={() => setEditing(false)} /> : <button type="button" className={s.secondary} style={{ marginBlock: 12 }} disabled={disabled || pending} onClick={() => setEditing(true)}>{delivery.detailsReady ? "تعديل بيانات المالك" : "استكمال بيانات المالك"}</button>)}
    {error && <p role="alert" className={s.error}>{error}</p>}
    <div className={s.actions}><button type="button" className={s.primary} disabled={disabled || pending || editing || !delivery.detailsReady || delivery.state === "editing" || delivery.state === "sending" || (delivery.state === "uncertain" && !retryConfirmed) || !cafe.trialAwaitingDelivery} onClick={send}>{pending ? <LoaderCircle className={s.spinner} size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}{pending ? "جارٍ إرسال تفاصيل الدخول" : "إرسال تفاصيل الدخول للمالك"}</button><button type="button" className={s.secondary} disabled={pending || disabled} onClick={() => { void refresh().catch(() => setError("تعذر تحديث الحالة حاول مجددًا")); }}>تحديث الحالة</button></div>
    {!cafe.trialAwaitingDelivery && <p className={s.error}>تم تغيير باقة العلامة بعد إنشاء الحساب</p>}
  </section>;
}
