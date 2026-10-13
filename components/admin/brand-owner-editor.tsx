"use client";
import { useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { updateAdminBrandOwnerAction } from "@/app/actions/admin-brand-onboarding";
import type { PlatformCafe } from "@/lib/platform/admin-data";
import s from "./brand-onboarding.module.css";

export function BrandOwnerEditor({ cafe, disabled, onBusyChange, onSaved, close }: { cafe: PlatformCafe; disabled: boolean; onBusyChange: (busy: boolean) => void; onSaved: (cafe: PlatformCafe) => void; close: () => void }) {
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || disabled) return;
    const form = new FormData(event.currentTarget);
    inFlight.current = true; setPending(true); setError(""); onBusyChange(true);
    try {
      const result = await updateAdminBrandOwnerAction({ requestId: crypto.randomUUID(), cafeId: cafe.id,
        ownerName: String(form.get("ownerName") ?? ""), phone: String(form.get("phone") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
      if (result.ok) { onSaved(result.data); close(); } else setError(result.message);
    } catch { setError("تعذر تأكيد الحفظ حدّث حالة العلامة ثم حاول مجددًا"); }
    finally { inFlight.current = false; setPending(false); onBusyChange(false); }
  }
  return <form onSubmit={save} className={s.ownerEditor} aria-busy={pending}>
    <fieldset className={s.fields} disabled={pending || disabled}>
      <legend>استكمال بيانات المالك</legend>
      <label><span className={s.fieldTitle}>اسم المالك</span><input name="ownerName" defaultValue={cafe.ownerName} minLength={2} maxLength={120} autoComplete="name" /></label>
      <label><span className={s.fieldTitle}>جوال الدخول والواتساب</span><input name="phone" defaultValue={cafe.ownerPhone} dir="ltr" type="tel" inputMode="tel" maxLength={24} placeholder="05xxxxxxxx" autoComplete="tel" /></label>
      <label><span className={s.fieldTitle}>البريد الإلكتروني <small>اختياري</small></span><input name="email" type="email" defaultValue={cafe.ownerEmail} dir="ltr" maxLength={254} autoComplete="email" /></label>
      <div className={s.field}><label htmlFor="owner-handoff-password" className={s.fieldTitle}>كلمة المرور <small>{cafe.ownerDelivery?.passwordReady ? "محفوظة" : "لم تُحدد"}</small></label><div className={s.password}><input id="owner-handoff-password" name="password" type={visible ? "text" : "password"} dir="ltr" minLength={8} maxLength={72} pattern="\S+" autoComplete="new-password" aria-describedby="owner-password-help" /><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></div><small id="owner-password-help" className={s.fieldHint}>{cafe.ownerDelivery?.passwordReady ? "اتركها فارغة للاحتفاظ بكلمة المرور أو اكتب كلمة جديدة" : "٨ أحرف على الأقل بدون مسافات مطلوبة قبل إرسال بيانات الدخول"}</small></div>
    </fieldset>
    {error && <p className={s.error} role="alert">{error}</p>}
    <div className={s.actions}><button className={s.primary} type="submit" disabled={pending || disabled}>{pending && <LoaderCircle className={s.spinner} size={18} aria-hidden="true" />}{pending ? "جارٍ حفظ البيانات" : "حفظ بيانات المالك"}</button><button className={s.secondary} type="button" disabled={pending} onClick={close}>إلغاء</button></div>
    <p className={s.preview}>الحفظ لا يرسل رسالة ولا يبدأ عداد التجربة</p>
  </form>;
}
