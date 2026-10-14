"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { enrollLoyaltyAction } from "@/app/actions/loyalty-experience";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import { RastHeader } from "./rast-brand";
import { RastStampCard } from "./rast-stamp-card";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName, loyaltyTheme } from "./loyalty-theme";

function westernDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit >= "۰" ? 1776 : 1632)));
}

export function RastEnrollment({ identity, program, authenticated = false }: { identity: LoyaltyIdentity; program: LoyaltyCardProgram; authenticated?: boolean }) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  function openCard() { if (!opening) startOpening(() => router.refresh()); }
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<"details" | "done">("details");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const digits = westernDigits(phone).replace(/\D/g, "");
    if (name.trim().length < 2 || name.trim().length > 120) { setError("اكتب اسمك من حرفين إلى 120 حرفًا"); return; }
    if (!/^(?:05\d{8}|5\d{8}|9665\d{8}|009665\d{8})$/.test(digits)) { setError("أدخل رقم جوال سعودي صحيح يبدأ بـ 05"); return; }
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await enrollLoyaltyAction(identity.slug, digits, name.trim());
      if (!result.ok) { setError(result.message); return; }
      setReturning(result.returningCustomer); setStage("done");
      openCard();
    } catch { setError("تعذر فتح البطاقة تحقق من اتصالك وحاول مرة أخرى"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  if (!program.enabled) return <main className={s.publicPage} style={loyaltyTheme(identity)} dir="rtl"><RastHeader identity={identity} /><section className={s.enrollmentLayout}><div className={s.enrollmentCopy}><span className={s.eyebrow}>{loyaltyCommunityName(identity)} برنامج الولاء</span><h1>نجهّز لك تجربة {loyaltyCommunityName(identity)}<br /><span>ترقّب الجديد</span></h1><p className={s.intro}>التسجيل في برنامج الولاء غير متاح حاليًا تقدر تتصفّح قائمة {identity.name}</p><Link href={`/menu/${identity.slug}`} className={s.primary}>تصفّح قائمة {identity.name} <ArrowLeft aria-hidden="true" /></Link></div></section><footer className={s.publicFooter}><span>{loyaltyCommunityName(identity)}</span><span>{identity.slug === "rast" ? "القهوة تجمعنا" : "كل زيارة لها مكافأة"}</span></footer></main>;

  if (authenticated) return <main className={s.publicPage} style={loyaltyTheme(identity)} dir="rtl"><RastHeader identity={identity} /><section className={s.memberIntro}><span className={s.eyebrow}>{loyaltyCommunityName(identity)}</span><h1>يا هلا برجعتك</h1><p className={s.intro}>تعذر فتح بطاقتك حاليًا جرّب تحديث الصفحة أو تواصل مع فريق {identity.name} لمراجعة حالة بطاقتك</p><button type="button" className={s.primary} disabled={opening} aria-busy={opening} onClick={openCard}>{opening ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : null}<span role="status">{opening ? "جار فتح بطاقتك" : "تحديث الصفحة"}</span></button></section></main>;

  return <main className={s.publicPage} style={loyaltyTheme(identity)} dir="rtl">
    <RastHeader identity={identity} />
    <div className={s.enrollmentLayout}>
      <div className={s.enrollmentCopy}>
        <span className={s.eyebrow}>{loyaltyCommunityName(identity)} برنامج الولاء</span>
        <h1>زيارتك تسعدنا<br /><span>ولحظاتك معنا مكافأة</span></h1>
        <p className={s.intro}>{identity.slug === "taza" ? "حمّل بطاقة ولاء تازا سجّل اسمك وجوالك ثم أضف البطاقة إلى محفظة جوالك" : "اجمع أختام زياراتك واستمتع بمكافأتك بطاقتك معك وكل زيارة تحسب لك"}</p>
        {stage === "done" ? <div className={s.welcome} role="status"><Check aria-hidden="true" /><h2>{returning ? `يا هلا برجعتك ${name.trim()}` : `يا هلا فيك يا ${name.trim()}`}</h2><p>بطاقتك تجمع لحظاتك الحلوة معنا</p><button type="button" className={s.primary} disabled={opening} aria-busy={opening} onClick={openCard}><span role="status">{opening ? "جار فتح بطاقتك" : "عرض بطاقتي"}</span>{opening ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}</button></div> : <form className={s.enrollmentForm} onSubmit={enroll} aria-busy={pending}>
          <div className={s.formHeading}><h2>انضم إلى {loyaltyCommunityName(identity)}</h2></div>
            <label className={s.field} htmlFor="rast-name"><span>اسمك</span><input id="rast-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} placeholder="الاسم اللي نناديك فيه" required disabled={pending} /></label>
            <label className={s.field} htmlFor="rast-phone"><span>رقم الجوال</span><input id="rast-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="05xxxxxxxx" dir="ltr" maxLength={20} required disabled={pending} aria-describedby="rast-phone-hint" /></label>
            <p className={s.fieldHint} id="rast-phone-hint">إذا عندك بطاقة استخدم الاسم ورقم الجوال المسجّلين لفتحها</p>
          {error ? <p ref={errorRef} tabIndex={-1} className={s.error} role="alert">{error}</p> : null}
          <button type="submit" className={s.primary} disabled={pending}><span role="status">{pending ? "جار فتح بطاقتك" : "افتح بطاقتي"}</span>{pending ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}</button>
        </form>}
      </div>
      <aside className={s.enrollmentPreview}><RastStampCard identity={identity} stamps={0} required={program.purchasesRequired} rewardName={program.rewardName} stampStyle={program.stampStyle} preview /><p>بطاقة واحدة زيارات أكثر لحظات أحلى</p></aside>
    </div>
    <footer className={s.publicFooter}><span>{loyaltyCommunityName(identity)}</span><span>{identity.slug === "rast" ? "القهوة تجمعنا والولاء يقرّبنا" : "زيارتك تسعدنا والولاء يقرّبنا"}</span></footer>
  </main>;
}
