"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle, MessageCircle, ShieldCheck } from "lucide-react";
import { completeLoyaltyOtpAction, requestLoyaltyOtpAction } from "@/app/actions/loyalty-experience";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import { RastHeader } from "./rast-brand";
import { RastStampCard } from "./rast-stamp-card";
import s from "./rast-loyalty.module.css";

function westernDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
}

export function RastEnrollment({ identity, program, authenticated = false }: { identity: LoyaltyIdentity; program: LoyaltyCardProgram; authenticated?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [stage, setStage] = useState<"details" | "code" | "done">("details");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [returning, setReturning] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (retrySeconds <= 0) return;
    const timer = window.setTimeout(() => setRetrySeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retrySeconds]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (stage === "code") codeRef.current?.focus(); }, [stage]);

  async function sendCode() {
    if (pendingRef.current || retrySeconds > 0) return;
    const digits = westernDigits(phone).replace(/\D/g, "");
    if (name.trim().length < 2 || name.trim().length > 120) { setError("اكتب اسمك من حرفين إلى 120 حرفًا"); return; }
    if (!/^(?:05\d{8}|5\d{8}|9665\d{8}|009665\d{8})$/.test(digits)) { setError("أدخل رقم جوال سعودي صحيح يبدأ بـ 05"); return; }
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await requestLoyaltyOtpAction(identity.slug, digits);
      if (!result.required || !result.ok) {
        setError(result.required ? result.message : "خدمة التحقق غير متاحة الآن حاول لاحقًا");
        if (result.required && "retryAfterSeconds" in result && result.retryAfterSeconds) setRetrySeconds(result.retryAfterSeconds);
        return;
      }
      setMaskedPhone(result.maskedPhone);
      setRetrySeconds(result.resendAfterSeconds);
      setCode(""); setStage("code");
    } catch { setError("تعذر الاتصال تحقق من اتصالك وحاول إرسال الرمز مرة أخرى"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === "details") { await sendCode(); return; }
    if (pendingRef.current) return;
    if (!/^\d{6}$/.test(code)) { setError("أدخل رمز التحقق المكوّن من 6 أرقام"); return; }
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await completeLoyaltyOtpAction(identity.slug, westernDigits(phone), code, name.trim());
      if (!result.ok) { setError(result.message); return; }
      setReturning(result.returningCustomer); setStage("done");
      router.refresh();
    } catch { setError("تعذر إكمال التحقق حاول مرة أخرى مع الاحتفاظ بالرمز"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  if (!program.enabled) return <main className={s.publicPage} dir="rtl"><RastHeader identity={identity} /><section className={s.enrollmentLayout}><div className={s.enrollmentCopy}><span className={s.eyebrow}>أهل مقهى الكواكب · برنامج الولاء</span><h1>نجهّز لك تجربة أهل مقهى الكواكب<br /><span>ترقّب الجديد</span></h1><p className={s.intro}>التسجيل في برنامج الولاء غير متاح حاليًا إلى ذلك الحين خذ لك لحظة قهوة وتصفّح قائمة مقهى الكواكب</p><Link href="/menu/rast" className={s.primary}>تصفّح قائمة مقهى الكواكب <ArrowLeft aria-hidden="true" /></Link></div></section><footer className={s.publicFooter}><span>أهل مقهى الكواكب</span><span>القهوة تجمعنا</span></footer></main>;

  if (authenticated) return <main className={s.publicPage} dir="rtl"><RastHeader identity={identity} /><section className={s.memberIntro}><span className={s.eyebrow}>أهل مقهى الكواكب</span><h1>يا هلا برجعتك</h1><p className={s.intro}>تعذر فتح بطاقتك حاليًا جرّب تحديث الصفحة أو تواصل مع فريق مقهى الكواكب لمراجعة حالة بطاقتك</p><button type="button" className={s.primary} onClick={() => router.refresh()}>تحديث الصفحة</button></section></main>;

  return <main className={s.publicPage} dir="rtl">
    <RastHeader identity={identity} />
    <div className={s.enrollmentLayout}>
      <div className={s.enrollmentCopy}>
        <span className={s.eyebrow}>أهل مقهى الكواكب · برنامج الولاء</span>
        <h1>زيارتك تسعدنا<br /><span>ولحظاتك معنا مكافأة</span></h1>
        <p className={s.intro}>اجمع أختام زياراتك واستمتع بمكافأتك بطاقتك معك وكل لحظة قهوة تحسب لك</p>
        {stage === "done" ? <div className={s.welcome} role="status"><Check aria-hidden="true" /><h2>{returning ? `يا هلا برجعتك ${name.trim()}` : `يا هلا فيك يا ${name.trim()}`}</h2><p>بطاقتك تجمع لحظاتك الحلوة معنا</p><button type="button" className={s.primary} onClick={() => router.refresh()}>عرض بطاقتي <ArrowLeft aria-hidden="true" /></button></div> : <form className={s.enrollmentForm} onSubmit={verifyCode} aria-busy={pending}>
          <div className={s.formHeading}><h2>{stage === "details" ? "انضم لأهل مقهى الكواكب" : "باقي خطوة ونقول يا هلا"}</h2><span>{stage === "details" ? "١ / ٢" : "٢ / ٢"}</span></div>
          {stage === "details" ? <>
            <label className={s.field} htmlFor="rast-name"><span>اسمك</span><input id="rast-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} placeholder="الاسم اللي نناديك فيه" required disabled={pending} /></label>
            <label className={s.field} htmlFor="rast-phone"><span>رقم الجوال</span><input id="rast-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" dir="ltr" maxLength={20} required disabled={pending} aria-describedby="rast-phone-hint" /></label>
            <p className={s.fieldHint} id="rast-phone-hint"><MessageCircle aria-hidden="true" />نرسل لك رمز التحقق على واتساب</p>
          </> : <>
            <p className={s.codeIntro}>أرسلنا رمز التحقق إلى واتساب <b dir="ltr">{maskedPhone}</b></p>
            <label className={s.field} htmlFor="rast-code"><span>رمز التحقق</span><input ref={codeRef} id="rast-code" className={s.codeInput} name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(westernDigits(event.target.value).replace(/\D/g, "").slice(0, 6))} dir="ltr" required disabled={pending} /></label>
            <div className={s.otpActions}><button type="button" className={s.textButton} disabled={pending || retrySeconds > 0} onClick={() => void sendCode()}>{retrySeconds > 0 ? `إعادة الإرسال بعد ${retrySeconds} ثانية` : "إرسال رمز جديد"}</button><button type="button" className={s.textButton} disabled={pending} onClick={() => { setStage("details"); setCode(""); setError(""); }}>تعديل الرقم</button></div>
          </>}
          {error ? <p ref={errorRef} tabIndex={-1} className={s.error} role="alert">{error}</p> : null}
          <button type="submit" className={s.primary} disabled={pending || (stage === "details" && retrySeconds > 0)}>{pending ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : null}{pending ? "لحظة من فضلك…" : stage === "details" ? retrySeconds > 0 ? `حاول بعد ${retrySeconds} ثانية` : "أرسل رمز التحقق" : "تحقق وافتح بطاقتي"}<ArrowLeft aria-hidden="true" /></button>
          <p className={s.privacy}><ShieldCheck aria-hidden="true" />رقمك للتحقق من هويتك وحماية بطاقتك</p>
        </form>}
      </div>
      <aside className={s.enrollmentPreview}><RastStampCard identity={identity} stamps={0} required={program.purchasesRequired} rewardName={program.rewardName} preview /><p>بطاقة واحدة زيارات أكثر لحظات أحلى</p></aside>
    </div>
    <footer className={s.publicFooter}><span>أهل مقهى الكواكب</span><span>القهوة تجمعنا والولاء يقرّبنا</span></footer>
  </main>;
}
