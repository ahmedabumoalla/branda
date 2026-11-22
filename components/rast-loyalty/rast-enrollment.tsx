"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { enrollLoyaltyAction } from "@/app/actions/loyalty-experience";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import { RastHeader } from "./rast-brand";
import { normalizeBrandPhone, type BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { RastStampCard } from "./rast-stamp-card";
import { PointsRewardPath } from "@/components/loyalty/points-reward-path";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName, loyaltyTheme } from "./loyalty-theme";
import { MAQAS77_SLUG } from "@/lib/platform/maqas77";

export function RastEnrollment({ identity, program, authenticated = false, phoneCountry = "SA" }: { phoneCountry?: BrandPhoneCountry; identity: LoyaltyIdentity; program: LoyaltyCardProgram; authenticated?: boolean }) {
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  function openCard() { if (!opening) startOpening(() => router.refresh()); }
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const asksBirthDate = identity.slug === MAQAS77_SLUG;
  const [stage, setStage] = useState<"details" | "done">("details");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [returning, setReturning] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const previewRef = useRef<HTMLDetailsElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 721px)");
    const syncPreview = () => { if (previewRef.current) previewRef.current.open = media.matches; };
    syncPreview();
    media.addEventListener("change", syncPreview);
    return () => media.removeEventListener("change", syncPreview);
  }, []);

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    const digits = normalizeBrandPhone(phone, phoneCountry);
    if (name.trim().length < 2 || name.trim().length > 120) { setError("اكتب اسمك من حرفين إلى 120 حرفًا"); return; }
    if (!digits) { setError(phoneCountry === "PS" ? "أدخل رقم جوال فلسطيني يبدأ بـ 056 أو 059" : "أدخل رقم جوال سعودي صحيح يبدأ بـ 05"); return; }
    if (asksBirthDate) {
      const today = new Date();
      const limit = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate < "1900-01-01" || birthDate > limit) { setError("اختر تاريخ ميلادك الصحيح"); return; }
    }
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await enrollLoyaltyAction(identity.slug, digits, name.trim(), asksBirthDate ? birthDate : undefined, identity.branchId);
      if (!result.ok) { setError(result.message); return; }
      setReturning(result.returningCustomer); setStage("done");
      openCard();
    } catch { setError("تعذر فتح البطاقة تحقق من اتصالك وحاول مرة أخرى"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  if (!program.enabled) return <main className={s.publicPage} style={loyaltyTheme(identity)} dir="rtl"><RastHeader identity={identity} /><section className={s.enrollmentLayout}><div className={s.enrollmentCopy}><span className={s.eyebrow}>{loyaltyCommunityName(identity)} برنامج الولاء</span><h1>نجهّز لك تجربة {loyaltyCommunityName(identity)}<br /><span>ترقّب الجديد</span></h1><p className={s.intro}>التسجيل في برنامج الولاء غير متاح حاليًا تقدر تتصفّح قائمة {identity.name}</p><Link href={`/menu/${identity.slug}`} className={s.primary}>تصفّح قائمة {identity.name} <ArrowLeft aria-hidden="true" /></Link></div></section><footer className={s.publicFooter}><span>{loyaltyCommunityName(identity)}</span><span>{identity.slug === "rast" ? "القهوة تجمعنا" : "كل زيارة لها مكافأة"}</span></footer></main>;

  if (authenticated) return <main className={s.publicPage} style={loyaltyTheme(identity)} dir="rtl"><RastHeader identity={identity} /><section className={s.memberIntro}><span className={s.eyebrow}>{loyaltyCommunityName(identity)}</span><h1>يا هلا برجعتك</h1><p className={s.intro}>تعذر فتح بطاقتك حاليًا جرّب تحديث الصفحة أو تواصل مع فريق {identity.name} لمراجعة حالة بطاقتك</p><button type="button" className={s.primary} disabled={opening} aria-busy={opening} onClick={openCard}>{opening ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : null}<span role="status">{opening ? "جار فتح بطاقتك" : "تحديث الصفحة"}</span></button></section></main>;

  return <main className={`${s.publicPage} ${s.enrollmentPage}`} style={loyaltyTheme(identity)} dir="rtl">
    <RastHeader identity={identity} />
    <div className={s.enrollmentLayout}>
      <div className={s.enrollmentCopy}>
        <span className={s.eyebrow}>{loyaltyCommunityName(identity)} برنامج الولاء</span>
        <h1>زيارتك تسعدنا<br /><span>ولحظاتك معنا مكافأة</span></h1>
        <p className={s.intro}>{program.pointsProgram?.mode === "points" ? "اجمع نقاطًا من قيمة فواتيرك وتابع مكافأتك القادمة على بطاقتك" : identity.slug === "taza" ? "حمّل بطاقة ولاء تازا سجّل اسمك وجوالك ثم أضف البطاقة إلى محفظة جوالك" : "اجمع أختام زياراتك واستمتع بمكافأتك بطاقتك معك وكل زيارة تحسب لك"}</p>
        {stage === "done" ? <div className={s.welcome} role="status"><Check aria-hidden="true" /><h2>{returning ? `يا هلا برجعتك ${name.trim()}` : `يا هلا فيك يا ${name.trim()}`}</h2><p>بطاقتك تجمع لحظاتك الحلوة معنا</p><button type="button" className={s.primary} disabled={opening} aria-busy={opening} onClick={openCard}><span role="status">{opening ? "جار فتح بطاقتك" : "عرض بطاقتي"}</span>{opening ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}</button></div> : <form className={s.enrollmentForm} onSubmit={enroll} aria-busy={pending}>
          <div className={s.formHeading}><h2>انضم إلى {loyaltyCommunityName(identity)}</h2></div>
            <label className={s.field} htmlFor="rast-name"><span>اسمك</span><input id="rast-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} placeholder="الاسم اللي نناديك فيه" required disabled={pending} /></label>
            <label className={s.field} htmlFor="rast-phone"><span>رقم الجوال</span><input id="rast-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={phoneCountry === "PS" ? "059xxxxxxx" : "05xxxxxxxx"} dir="ltr" maxLength={20} required disabled={pending} aria-describedby="rast-phone-hint" /></label>
            {asksBirthDate ? <label className={s.field} htmlFor="rast-birth"><span>تاريخ ميلادك</span><input id="rast-birth" name="birthDate" type="date" autoComplete="bday" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} min="1900-01-01" required disabled={pending} /></label> : null}
            <p className={s.fieldHint} id="rast-phone-hint">إذا عندك بطاقة استخدم الاسم ورقم الجوال المسجّلين لفتحها</p>
          {error ? <p ref={errorRef} tabIndex={-1} className={s.error} role="alert">{error}</p> : null}
          <button type="submit" className={s.primary} disabled={pending}><span role="status">{pending ? "جار فتح بطاقتك" : "افتح بطاقتي"}</span>{pending ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}</button>
        </form>}
      </div>
      <details ref={previewRef} className={s.previewDisclosure}><summary>شاهد بطاقة الولاء ومكافأتك</summary><aside className={s.enrollmentPreview}>{program.pointsProgram?.mode === "points" ? <PointsRewardPath balance={0} milestones={program.pointsProgram.milestones} /> : <><RastStampCard identity={identity} stamps={0} required={program.purchasesRequired} rewardName={program.rewardName} stampStyle={program.stampStyle} preview /><p>بطاقة واحدة زيارات أكثر لحظات أحلى</p></>}</aside></details>
    </div>
    <footer className={s.publicFooter}><span>{loyaltyCommunityName(identity)}</span><span>{identity.slug === "rast" ? "القهوة تجمعنا والولاء يقرّبنا" : "زيارتك تسعدنا والولاء يقرّبنا"}</span></footer>
  </main>;
}
