"use client";

import { loyaltyText, type LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";
import { enrollLoyaltyAction } from "@/app/actions/loyalty-experience";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import { RastHeader } from "./rast-brand";
import { getBrandCountry, normalizeBrandPhone, type BrandPhoneCountry } from "@/lib/auth/brand-phone";
import { RastStampCard } from "./rast-stamp-card";
import { PointsRewardPath } from "@/components/loyalty/points-reward-path";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName, loyaltyTheme } from "./loyalty-theme";
import { MAQAS77_SLUG } from "@/lib/platform/maqas77";

export function RastEnrollment({ language = "ar", identity, program, authenticated = false, phoneCountry = "SA" }: { language?: LoyaltyLanguage; phoneCountry?: BrandPhoneCountry; identity: LoyaltyIdentity; program: LoyaltyCardProgram; authenticated?: boolean }) {
  const en = language === "en";
  const router = useRouter();
  const [opening, startOpening] = useTransition();
  function openCard() { if (!opening) startOpening(() => router.refresh()); }
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const community = en ? loyaltyText(identity.nameEn || identity.name, language) : loyaltyCommunityName(identity);
  const country = getBrandCountry(phoneCountry);
  const countryName = en ? new Intl.DisplayNames(["en"], { type: "region" }).of(phoneCountry) : country.name;
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
    if (name.trim().length < 2 || name.trim().length > 120) { setError(en ? "Enter a name between 2 and 120 characters" : "اكتب اسمك من حرفين إلى 120 حرفًا"); return; }
    if (!digits) { setError(en ? `Enter a valid mobile number for ${countryName} (+${country.callingCode})` : `أدخل رقم جوال صحيح لدولة الحساب ${getBrandCountry(phoneCountry).name} (+${getBrandCountry(phoneCountry).callingCode})`); return; }
    if (asksBirthDate) {
      const today = new Date();
      const limit = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate < "1900-01-01" || birthDate > limit) { setError(en ? "Enter a valid date of birth" : "اختر تاريخ ميلادك الصحيح"); return; }
    }
    pendingRef.current = true; setPending(true); setError("");
    try {
      const result = await enrollLoyaltyAction(identity.slug, digits, name.trim(), asksBirthDate ? birthDate : undefined, identity.branchId);
      if (!result.ok) { setError(loyaltyText(result.message, language)); return; }
      setReturning(result.returningCustomer); setStage("done");
      openCard();
    } catch { setError(en ? "Unable to open your card. Check your connection and try again" : "تعذر فتح البطاقة تحقق من اتصالك وحاول مرة أخرى"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  if (!program.enabled) return <main className={s.publicPage} style={loyaltyTheme(identity)} dir={en ? "ltr" : "rtl"} lang={language}><RastHeader language={language} identity={identity} /><section className={s.enrollmentLayout}><div className={s.enrollmentCopy}><span className={s.eyebrow}>{community} {en ? "loyalty program" : "برنامج الولاء"}</span><h1>{en ? "Coming soon to" : "نجهّز لك تجربة"} {community}<br /><span>{en ? "Stay tuned" : "ترقّب الجديد"}</span></h1><p className={s.intro}>{en ? "Enrollment is currently closed. You can still browse the menu" : `التسجيل في برنامج الولاء غير متاح حاليًا تقدر تتصفّح قائمة ${identity.name}`}</p><Link href={`/menu/${identity.slug}`} className={s.primary}>{en ? "Browse the menu" : `تصفّح قائمة ${identity.name}`} <ArrowLeft aria-hidden="true" /></Link></div></section><footer className={s.publicFooter}><span>{community}</span><span>{en ? "Every visit counts" : identity.slug === "rast" ? "القهوة تجمعنا" : "كل زيارة لها مكافأة"}</span></footer></main>;

  if (authenticated) return <main className={s.publicPage} style={loyaltyTheme(identity)} dir={en ? "ltr" : "rtl"} lang={language}><RastHeader language={language} identity={identity} /><section className={s.memberIntro}><span className={s.eyebrow}>{community}</span><h1>{en ? "Welcome back" : "يا هلا برجعتك"}</h1><p className={s.intro}>{en ? "We couldn’t load your card. Refresh the page or contact the brand" : `تعذر فتح بطاقتك حاليًا جرّب تحديث الصفحة أو تواصل مع فريق ${identity.name} لمراجعة حالة بطاقتك`}</p><button type="button" className={s.primary} disabled={opening} aria-busy={opening} onClick={openCard}>{opening ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : null}<span role="status">{en ? (opening ? "Opening your card" : "Refresh page") : opening ? "جار فتح بطاقتك" : "تحديث الصفحة"}</span></button></section></main>;

  return <main className={`${s.publicPage} ${s.enrollmentPage}`} style={loyaltyTheme(identity)} dir={en ? "ltr" : "rtl"} lang={language}>
    <RastHeader language={language} identity={identity} />
    <div className={s.enrollmentLayout}>
      <div className={s.enrollmentCopy}>
        <span className={s.eyebrow}>{community} {en ? "loyalty program" : "برنامج الولاء"}</span>
        <h1>{en ? "Welcome to our loyalty program" : "زيارتك تسعدنا"}<br /><span>{en ? "Earn a reward with your visits" : "ولحظاتك معنا مكافأة"}</span></h1>
        <p className={s.intro}>{en ? (program.pointsProgram?.mode === "points" ? "Earn points on purchases and track your next reward" : "Collect stamps on qualifying visits and follow your progress toward a reward") : program.pointsProgram?.mode === "points" ? "اجمع نقاطًا من قيمة فواتيرك وتابع مكافأتك القادمة على بطاقتك" : identity.slug === "taza" ? "حمّل بطاقة ولاء تازا سجّل اسمك وجوالك ثم أضف البطاقة إلى محفظة جوالك" : "اجمع أختام زياراتك واستمتع بمكافأتك بطاقتك معك وكل زيارة تحسب لك"}</p>
        {stage === "done" ? <div className={s.welcome} role="status"><Check aria-hidden="true" /><h2>{en ? `${returning ? "Welcome back" : "Welcome"}, ${name.trim()}` : returning ? `يا هلا برجعتك ${name.trim()}` : `يا هلا فيك يا ${name.trim()}`}</h2><p>{en ? "Your loyalty card is ready" : "بطاقتك تجمع لحظاتك الحلوة معنا"}</p><button type="button" className={s.primary} disabled={opening} aria-busy={opening} onClick={openCard}><span role="status">{en ? (opening ? "Opening your card" : "View my card") : opening ? "جار فتح بطاقتك" : "عرض بطاقتي"}</span>{opening ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}</button></div> : <form className={s.enrollmentForm} onSubmit={enroll} aria-busy={pending}>
          <div className={s.formHeading}><h2>{en ? "Join" : "انضم إلى"} {community}</h2></div>
            <label className={s.field} htmlFor="rast-name"><span>{en ? "Your name" : "اسمك"}</span><input id="rast-name" name="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} placeholder={en ? "Your name" : "الاسم اللي نناديك فيه"} required disabled={pending} /></label>
            <label className={s.field} htmlFor="rast-phone"><span>{en ? "Mobile number" : "رقم الجوال"} — {countryName} (+{getBrandCountry(phoneCountry).callingCode})</span><input id="rast-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={getBrandCountry(phoneCountry).placeholder} dir="ltr" maxLength={30} required disabled={pending} aria-describedby="rast-phone-hint" /></label>
            {asksBirthDate ? <label className={s.field} htmlFor="rast-birth"><span>{en ? "Date of birth" : "تاريخ ميلادك"}</span><input id="rast-birth" name="birthDate" type="date" autoComplete="bday" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} min="1900-01-01" required disabled={pending} /></label> : null}
            <p className={s.fieldHint} id="rast-phone-hint">{en ? "Already have a card? Use your registered name and mobile number" : "إذا عندك بطاقة استخدم الاسم ورقم الجوال المسجّلين لفتحها"}</p>
          {error ? <p ref={errorRef} tabIndex={-1} className={s.error} role="alert">{error}</p> : null}
          <button type="submit" className={s.primary} disabled={pending}><span role="status">{en ? (pending ? "Opening your card" : "Open my card") : pending ? "جار فتح بطاقتك" : "افتح بطاقتي"}</span>{pending ? <LoaderCircle className={s.spinner} aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}</button>
        </form>}
      </div>
      <details ref={previewRef} className={s.previewDisclosure}><summary>{en ? "Preview your card and reward" : "شاهد بطاقة الولاء ومكافأتك"}</summary><aside className={s.enrollmentPreview}>{program.pointsProgram?.mode === "points" ? <PointsRewardPath language={language} balance={0} milestones={program.pointsProgram.milestones} /> : <><RastStampCard language={language} identity={identity} stamps={0} required={program.purchasesRequired} rewardName={program.rewardName} stampStyle={program.stampStyle} preview /><p>{en ? "Use the same card on every visit" : "بطاقة واحدة زيارات أكثر لحظات أحلى"}</p></>}</aside></details>
    </div>
    <footer className={s.publicFooter}><span>{community}</span><span>{en ? "Every visit counts" : identity.slug === "rast" ? "القهوة تجمعنا والولاء يقرّبنا" : "زيارتك تسعدنا والولاء يقرّبنا"}</span></footer>
  </main>;
}
