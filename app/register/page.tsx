"use client";

import Link from "next/link";
import { Eye, EyeOff, ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { registerCafeOwnerAction, requestOwnerRegistrationOtpAction, verifyOwnerRegistrationOtpAction, resolveOwnerRegistrationMapAction } from "@/app/actions/auth";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { isAllowedGoogleMapsUrl } from "@/lib/maps/google-maps-url";
import styles from "./register.module.css";

const steps = ["بيانات العلامة", "تحقق واتساب", "كلمة المرور"];
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({ brandNameAr: "", brandNameEn: "", ownerName: "", email: "", phone: "", mapsUrl: "", couponCode: "" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [map, setMap] = useState<{ url: string; latitude: number; longitude: number } | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const update = (field: keyof typeof draft, value: string) => setDraft(current => ({ ...current, [field]: value }));
  async function previewMap() {
    if (!draft.mapsUrl || !isAllowedGoogleMapsUrl(draft.mapsUrl)) return;
    const url = draft.mapsUrl;
    setMapLoading(true);
    try {
      const location = await resolveOwnerRegistrationMapAction(url);
      setMap(location?.latitude != null && location.longitude != null ? { url, latitude: location.latitude, longitude: location.longitude } : null);
    } catch { setMap(null); }
    finally { setMapLoading(false); }
  }
  async function sendCode() {
    const result = await requestOwnerRegistrationOtpAction(draft);
    setMessage(result.message);
    if (result.retryAfterSeconds) setResendAt(Date.now() + result.retryAfterSeconds * 1000);
    if (result.ok) { setCode(""); setStep(1); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setMessage("");
    try {
      if (step === 0) await sendCode();
      else if (step === 1) {
        const result = await verifyOwnerRegistrationOtpAction(code);
        setMessage(result.message);
        if (result.ok) setStep(2);
      } else {
        const result = await registerCafeOwnerAction({ password, confirmPassword });
        setMessage(result.message);
        if (result.ok && result.redirectTo) window.location.assign(result.redirectTo);
      }
    } catch { setMessage("تعذر الاتصال. حاول مجددًا دون إغلاق الصفحة."); }
    finally { setPending(false); }
  }
  async function resend() {
    if (pending) return;
    if (Date.now() < resendAt) { setMessage(`يمكنك إعادة الإرسال بعد ${Math.ceil((resendAt - Date.now()) / 1000)} ثانية.`); return; }
    setPending(true);
    try { await sendCode(); } catch { setMessage("تعذر إرسال الرمز. حاول مجددًا."); }
    finally { setPending(false); }
  }
  return (
    <main dir="rtl" className={styles.page}>
      <aside className={styles.story}>
        <BarndaksaLogo variant="dark" width={168} height={72} />
        <div className={styles.storyBody}><span className={styles.kicker}>خطوة جديدة لعلامتك</span><h1>منيوك جاهز<br />ليحكي قصتك.</h1><p>أنشئ حساب علامتك، وأضف منتجاتك، وشارك منيوك مع عملائك من مكان واحد.</p><div className={styles.trial}><strong>٧</strong><div><b>أيام تجربة مجانية</b><span>المنيو والمنتجات وإعدادات العلامة</span></div></div><p className={styles.note}>بدون بطاقة دفع. يمكنك اختيار الباقة المناسبة لاحقًا من لوحة التحكم.</p></div>
        <span className={styles.signature}>علامتك، بطابعها الخاص.</span>
      </aside>
      <section className={styles.content}><div className={styles.formWrap}>
        <div className={styles.topline}><Link href="/">برندة</Link><span>لديك حساب؟ <Link href="/login">تسجيل الدخول</Link></span></div>
        <ol className={styles.steps} aria-label="خطوات التسجيل">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step >= index ? styles.current : ""}><span>{step > index ? <Check size={14} aria-hidden="true" /> : index + 1}</span><b>{label}</b></li>)}</ol>
        <header className={styles.heading}><span className={styles.kicker}>إنشاء حساب علامة تجارية</span><h2>{step === 0 ? "لنبدأ بعلامتك" : step === 1 ? "تحقق من رقمك" : "الخطوة الأخيرة"}</h2><p>{step === 0 ? "بيانات بسيطة، ومساحة كاملة لعلامتك." : step === 1 ? `أدخل الرمز المرسل إلى واتساب ${draft.phone}.` : "اختر كلمة مرور آمنة، وسندخلك مباشرة إلى لوحة التحكم."}</p></header>
        {message ? <p className={styles.message} role="status" aria-live="polite">{message}</p> : null}
        <form onSubmit={submit} aria-busy={pending}><fieldset disabled={pending} className={styles.fields}>
          {step === 0 ? <>
            <div className={styles.columns}>
              <Field label="اسم العلامة بالعربية"><input value={draft.brandNameAr} onChange={event => update("brandNameAr", event.target.value)} required minLength={2} maxLength={120} autoComplete="organization" /></Field>
              <Field label="اسم العلامة بالإنجليزية"><input value={draft.brandNameEn} onChange={event => update("brandNameEn", event.target.value)} required minLength={2} maxLength={120} dir="ltr" /></Field>
            </div>
            <Field label="اسم المسؤول"><input value={draft.ownerName} onChange={event => update("ownerName", event.target.value)} required minLength={2} maxLength={120} autoComplete="name" /></Field>
            <div className={styles.columns}>
              <Field label="البريد الإلكتروني"><input type="email" value={draft.email} onChange={event => update("email", event.target.value)} required maxLength={254} autoComplete="email" dir="ltr" /></Field>
              <Field label="رقم الجوال المرتبط بواتساب"><input type="tel" value={draft.phone} onChange={event => update("phone", event.target.value)} required maxLength={24} autoComplete="tel" dir="ltr" /></Field>
            </div>
            <Field label="رابط موقع العلامة على خرائط Google"><input type="url" value={draft.mapsUrl} onChange={event => update("mapsUrl", event.target.value)} onBlur={previewMap} required maxLength={1000} dir="ltr" /><small>افتح موقعك في خرائط Google، ثم اختر مشاركة ونسخ الرابط.</small></Field>
            {mapLoading ? <p role="status" className={styles.note}>جارٍ تحديد الموقع على خرائط Google…</p> : null}
            {map?.url === draft.mapsUrl ? <iframe title="موقع العلامة على خرائط Google" loading="lazy" referrerPolicy="no-referrer" className={styles.map} src={`https://maps.google.com/maps?q=${map.latitude},${map.longitude}&z=16&output=embed`} /> : null}
            {draft.mapsUrl.startsWith("https://") && isAllowedGoogleMapsUrl(draft.mapsUrl) ? <a href={draft.mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>فتح الموقع على خرائط Google</a> : null}
            <Field label="كوبون الخصم (اختياري)"><input value={draft.couponCode} onChange={event => update("couponCode", event.target.value)} maxLength={30} dir="ltr" autoCapitalize="characters" /></Field>
          </> : step === 1 ? <>
            <Field label="رمز التحقق"><input className={styles.otp} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" dir="ltr" /></Field>
            <p className={styles.note}>الرمز صالح لخمس دقائق. لا تشاركه مع أي شخص.</p>
          </> : <>
            <div className={styles.verified}><ShieldCheck size={20} aria-hidden="true" /> تم التحقق من رقم واتساب</div>
            <PasswordField label="كلمة المرور" value={password} setValue={setPassword} visible={visible} toggle={() => setVisible(value => !value)} />
            <PasswordField label="تأكيد كلمة المرور" value={confirmPassword} setValue={setConfirmPassword} visible={confirmVisible} toggle={() => setConfirmVisible(value => !value)} />
            <p className={styles.note}>٨ أحرف على الأقل. يمكنك لصق كلمة المرور أو استخدام مدير كلمات المرور.</p>
          </>}
          <button className={styles.submit} type="submit">{pending ? "جارٍ إكمال الطلب…" : step === 0 ? "إرسال رمز التحقق عبر واتساب" : step === 1 ? "تحقق ومتابعة" : "إنشاء الحساب وبدء التجربة"}<ArrowLeft size={18} aria-hidden="true" /></button>
          {step === 1 ? <div className={styles.secondary}><button type="button" onClick={resend}>إعادة إرسال الرمز</button><button type="button" onClick={() => { setStep(0); setMessage(""); }}>تعديل البيانات</button></div> : null}
          {step === 2 ? <div className={styles.secondary}><button type="button" onClick={() => { setStep(0); setCode(""); setPassword(""); setConfirmPassword(""); setMessage(""); }}>بدء تحقق جديد أو تعديل البيانات</button></div> : null}
        </fieldset></form>
        <p className={styles.footer}>تجربة مجانية لمدة ٧ أيام، تشمل المنيو وإعدادات العلامة.</p>
      </div></section>
    </main>
  );
}
function PasswordField({ label, value, setValue, visible, toggle }: { label: string; value: string; setValue: (value: string) => void; visible: boolean; toggle: () => void }) {
  return <Field label={label}><span className={styles.password}><input type={visible ? "text" : "password"} value={value} onChange={event => setValue(event.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" dir="ltr" /><button type="button" onClick={toggle} aria-label={visible ? `إخفاء ${label}` : `إظهار ${label}`} aria-pressed={visible}>{visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span></Field>;
}
