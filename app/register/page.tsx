"use client";

import Link from "next/link";
import { Eye, EyeOff, ArrowLeft, Check, ShieldCheck, Store, MapPin, UserRound, Sparkles, LoaderCircle, TicketPercent } from "lucide-react";
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
    } catch { setMessage("تعذر الاتصال حاول مجددًا دون إغلاق الصفحة"); }
    finally { setPending(false); }
  }
  async function resend() {
    if (pending) return;
    if (Date.now() < resendAt) { setMessage(`يمكنك إعادة الإرسال بعد ${Math.ceil((resendAt - Date.now()) / 1000)} ثانية`); return; }
    setPending(true);
    try { await sendCode(); } catch { setMessage("تعذر إرسال الرمز حاول مجددًا"); }
    finally { setPending(false); }
  }
  return (
    <main dir="rtl" className={styles.page}>
      <aside className={styles.story}>
        <BarndaksaLogo variant="dark" width={168} height={72} />
        <div className={styles.storyBody}>
          <span className={styles.kicker}>لأن التفاصيل تصنع علامتك</span>
          <h1>منيو يحمل اسمك<br /><em>وتجربة تشبهك</em></h1>
          <p>اجمع منتجاتك وصورها وأسعارها في منيو مستقل وشارك رابطًا واحدًا مع كل عملائك</p>
          <div className={styles.menuPreview} aria-label="معاينة توضيحية لمنيو علامتك">
            <div className={styles.previewTop}><Store size={22} aria-hidden="true" /><span>مساحة علامتك</span><span className={styles.previewTag}>منيو مستقل</span></div>
            <div className={styles.previewTitle}>كل التفاصيل بطابعك</div>
            <div className={styles.previewLines} aria-hidden="true"><i /><i /><i /></div>
            <div className={styles.previewBottom}><span>اسمك ومنتجاتك وهويتك</span><ArrowLeft size={18} aria-hidden="true" /></div>
          </div>
          <ul className={styles.benefits}><li><Check size={17} aria-hidden="true" /> أضف منتجاتك وصورها وأسعارها</li><li><Check size={17} aria-hidden="true" /> شارك رابط المنيو المستقل</li><li><Check size={17} aria-hidden="true" /> حدّث التفاصيل من لوحة واحدة</li></ul>
        </div>
        <div className={styles.storyFoot}><span className={styles.signature}>من أول منتج إلى تجربة كاملة</span><span>صُنعت لعلامتك</span></div>
      </aside>
      <section className={styles.content}><div className={styles.formWrap}>
        <div className={styles.topline}><Link href="/" aria-label="برندة الرئيسية"><BarndaksaLogo variant="brown" width={100} height={42} /></Link><span>لديك حساب؟ <Link href="/login">تسجيل الدخول <ArrowLeft size={15} aria-hidden="true" /></Link></span></div>
        <div className={styles.formCard}>
        <ol className={styles.steps} aria-label="خطوات التسجيل">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={step >= index ? styles.current : ""}><span>{step > index ? <Check size={16} aria-hidden="true" /> : index + 1}</span><b>{label}</b></li>)}</ol>
        <header className={styles.heading}><span className={styles.kicker}>خطوتك الأولى مع برندة</span><h2>{step === 0 ? "أهلًا بعلامتك" : step === 1 ? "رسالة واحدة ونكمل" : "باقي خطوة وتبدأ"}</h2><p>{step === 0 ? "عرّفنا بعلامتك وجهّز أول منيو لك من مكان واحد" : step === 1 ? `أرسلنا رمز التحقق إلى واتساب ${draft.phone} أدخله لإكمال التسجيل` : "احمِ حسابك بكلمة مرور ثم انتقل إلى لوحة تحكم علامتك"}</p></header>
        <div className={styles.trial}><span className={styles.trialIcon}><Sparkles size={21} aria-hidden="true" /></span><div><b>٧ أيام لتجربة منيو علامتك</b><span>تبدأ بعد إنشاء الحساب بدون بطاقة دفع</span></div><span className={styles.free}>مجانية</span></div>
        {message ? <p className={styles.message} role="status" aria-live="polite">{message}</p> : null}
        <form onSubmit={submit} aria-busy={pending}><fieldset disabled={pending} className={styles.fields}>
          {step === 0 ? <>
            <div className={styles.fieldGroup}><h3><Store size={18} aria-hidden="true" /> هوية العلامة</h3>
            <div className={styles.columns}>
              <Field label="اسم العلامة بالعربية"><input placeholder="كما سيظهر لعملائك" value={draft.brandNameAr} onChange={event => update("brandNameAr", event.target.value)} required minLength={2} maxLength={120} autoComplete="organization" /></Field>
              <Field label="اسم العلامة بالإنجليزية"><input placeholder="Your brand name" value={draft.brandNameEn} onChange={event => update("brandNameEn", event.target.value)} required minLength={2} maxLength={120} dir="ltr" /></Field>
            </div>
            </div>
            <div className={styles.fieldGroup}><h3><UserRound size={18} aria-hidden="true" /> بيانات المسؤول</h3>
            <Field label="اسم المسؤول"><input placeholder="الاسم الكامل" value={draft.ownerName} onChange={event => update("ownerName", event.target.value)} required minLength={2} maxLength={120} autoComplete="name" /></Field>
            <div className={styles.columns}>
              <Field label="البريد الإلكتروني"><input type="email" placeholder="name@example.com" value={draft.email} onChange={event => update("email", event.target.value)} required maxLength={254} autoComplete="email" dir="ltr" /></Field>
              <Field label="رقم الجوال المرتبط بواتساب"><input type="tel" placeholder="05xxxxxxxx" value={draft.phone} onChange={event => update("phone", event.target.value)} required maxLength={24} autoComplete="tel" dir="ltr" /></Field>
            </div>
            <p className={styles.hint}><ShieldCheck size={15} aria-hidden="true" /> سنرسل رمز التحقق إلى رقم واتساب هذا</p></div>
            <div className={styles.fieldGroup}><h3><MapPin size={18} aria-hidden="true" /> موقع الفرع الأساسي</h3>
            <Field label="رابط الموقع على خرائط Google"><input type="url" placeholder="https://maps.app.goo.gl/…" value={draft.mapsUrl} onChange={event => update("mapsUrl", event.target.value)} onBlur={previewMap} required maxLength={1000} dir="ltr" /><small>من خرائط Google: افتح موقع فرعك ← مشاركة ← نسخ الرابط</small></Field>
            {mapLoading ? <p role="status" className={styles.note}>جارٍ تحديد الموقع على خرائط Google…</p> : null}
            {map?.url === draft.mapsUrl ? <iframe title="موقع العلامة على خرائط Google" loading="lazy" referrerPolicy="no-referrer" className={styles.map} src={`https://maps.google.com/maps?q=${map.latitude},${map.longitude}&z=16&output=embed`} /> : null}
            {draft.mapsUrl.startsWith("https://") && isAllowedGoogleMapsUrl(draft.mapsUrl) ? <a href={draft.mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>فتح الموقع على خرائط Google</a> : null}
            </div>
            <details className={styles.coupon}><summary><TicketPercent size={18} aria-hidden="true" /> لديك كوبون خصم؟ <span>اختياري</span></summary><Field label="كوبون الخصم"><input placeholder="أدخل رمز الكوبون" value={draft.couponCode} onChange={event => update("couponCode", event.target.value)} maxLength={30} dir="ltr" autoCapitalize="characters" /></Field></details>
          </> : step === 1 ? <>
            <Field label="رمز التحقق"><input className={styles.otp} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" dir="ltr" /></Field>
            <p className={styles.note}>الرمز صالح لخمس دقائق لا تشاركه مع أي شخص</p>
          </> : <>
            <div className={styles.verified}><ShieldCheck size={20} aria-hidden="true" /> تم التحقق من رقم واتساب</div>
            <PasswordField label="كلمة المرور" value={password} setValue={setPassword} visible={visible} toggle={() => setVisible(value => !value)} />
            <PasswordField label="تأكيد كلمة المرور" value={confirmPassword} setValue={setConfirmPassword} visible={confirmVisible} toggle={() => setConfirmVisible(value => !value)} />
            <p className={styles.note}>٨ أحرف على الأقل يمكنك لصق كلمة المرور أو استخدام مدير كلمات المرور</p>
          </>}
          <button className={styles.submit} type="submit">{pending ? "جارٍ إكمال الطلب…" : step === 0 ? "متابعة والتحقق عبر واتساب" : step === 1 ? "تأكيد الرمز والمتابعة" : "إنشاء الحساب وبدء التجربة"}{pending ? <LoaderCircle className={styles.spinner} size={20} aria-hidden="true" /> : <ArrowLeft size={20} aria-hidden="true" />}</button>
          {step === 1 ? <div className={styles.secondary}><button type="button" onClick={resend}>إعادة إرسال الرمز</button><button type="button" onClick={() => { setStep(0); setMessage(""); }}>تعديل البيانات</button></div> : null}
          {step === 2 ? <div className={styles.secondary}><button type="button" onClick={() => { setStep(0); setCode(""); setPassword(""); setConfirmPassword(""); setMessage(""); }}>بدء تحقق جديد أو تعديل البيانات</button></div> : null}
        </fieldset></form>
        <p className={styles.footer}>تشمل التجربة المنيو والمنتجات وإعدادات العلامة<br />الولاء والعروض متاحة عند الاشتراك في باقة تدعمها</p>
        </div>
        <p className={styles.bottomNote}>علامتك تستحق تجربة تليق بها</p>
      </div></section>
    </main>
  );
}
function PasswordField({ label, value, setValue, visible, toggle }: { label: string; value: string; setValue: (value: string) => void; visible: boolean; toggle: () => void }) {
  return <Field label={label}><span className={styles.password}><input type={visible ? "text" : "password"} value={value} onChange={event => setValue(event.target.value)} minLength={8} maxLength={72} required autoComplete="new-password" dir="ltr" /><button type="button" onClick={toggle} aria-label={visible ? `إخفاء ${label}` : `إظهار ${label}`} aria-pressed={visible}>{visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span></Field>;
}
