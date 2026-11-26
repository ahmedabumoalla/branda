import { LoyaltyLanguageLink } from "@/components/rast-loyalty/loyalty-language-link";
import type { LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import type { LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import Image from "next/image";
import { ArrowUpLeft, Gift, ScanLine, ShieldCheck } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { RastQrCode } from "@/components/rast-loyalty/qr-code";
import { loyaltyTheme } from "@/components/rast-loyalty/loyalty-theme";
import { brandStampArtwork } from "@/lib/loyalty/brand-stamp-artwork";
import { TogetherBrandMark } from "@/components/store/together-brand-mark";
import s from "./loyalty-qr-landing.module.css";

type Props = { language?: LoyaltyLanguage; identity: LoyaltyIdentity; program: Pick<LoyaltyCardProgram, "purchasesRequired" | "rewardName" | "terms" | "pointsProgram">; signupUrl: string };

export function LoyaltyQrLanding({ language = "ar", identity, program, signupUrl }: Props) {
  const en = language === "en";
  const points = program.pointsProgram?.mode === "points" ? program.pointsProgram : null;
  const reward = points?.milestones[0]?.reward || program.rewardName;
  const plant = brandStampArtwork(identity.slug);
  const logo = identity.logoDisplayUrl || identity.logoUrl;
  return <main className={s.page} style={loyaltyTheme(identity)} lang={language} dir={en ? "ltr" : "rtl"} data-botanical={Boolean(plant)}>
    <div className={s.ambient} aria-hidden="true" />
    <div className={s.language}><LoyaltyLanguageLink language={language} /></div>
    <section className={s.poster} aria-labelledby="loyalty-title">
      <header className={s.brand}>
        {plant ? <TogetherBrandMark className={s.botanicalMark} /> : logo && <Image src={logo} alt={en ? `${identity.name} logo` : `شعار ${identity.name}`} width={180} height={110} unoptimized className={s.logo} />}
        <p>{identity.name}</p><span>{en ? "Loyalty and rewards" : "الولاء والمكافآت"}</span>
      </header>
      <div className={s.story}>
        <span className={s.eyebrow}><Gift size={17} aria-hidden="true" />{en ? "Earn rewards with us" : "مكانك معنا له مكافأة"}</span>
        <h1 id="loyalty-title">{en ? "Every visit counts" : "زياراتك تكبر"}<span>{en ? "Get closer to your reward" : "ومكافأتك تقرّب"}</span></h1>
        <p>{points ? (en ? "Earn points on purchases and redeem them for rewards" : "اجمع نقاطًا على مشترياتك واستبدلها بمكافآت") : <>{en ? "Collect" : "اجمع"} <strong>{program.purchasesRequired} {en ? "stamps" : "أختام"}</strong> {en ? "to earn your reward" : "واستمتع بمكافأتك"}</>}</p>
        <div className={s.reward}>{logo && <Image src={plant ? "/together/logo.webp" : logo} alt={en ? `${identity.name} logo` : `شعار ${identity.name}`} width={48} height={48} unoptimized />}<div><span>{en ? "Your next reward" : "مكافأتك القادمة"}</span><strong>{reward}</strong></div></div>
      </div>
      <div className={s.scan}>
        <div className={s.qrFrame}><RastQrCode value={signupUrl} label={en ? `${identity.name} loyalty signup code` : `رمز التسجيل في ولاء ${identity.name}`} /></div>
        <h2><ScanLine size={20} aria-hidden="true" />{en ? "Scan to get started" : "امسح الرمز وابدأ رحلتك"}</h2>
        <p>{en ? "Sign up or open your existing card" : "يفتح بطاقة الولاء لتسجيلك أو الوصول إلى بطاقتك"}</p>
        <a href={signupUrl} className={s.join}>{en ? "Open loyalty card" : "افتح بطاقة الولاء"}<ArrowUpLeft size={19} aria-hidden="true" /></a>
        <span className={s.sameDevice}>{en ? "On your phone? Tap the button to open your card" : "تتصفح من جوالك؟ افتح البطاقة مباشرة من الزر"}</span>
      </div>
      <footer className={s.footer}><ShieldCheck size={16} aria-hidden="true" /><span>{en ? "Use your name and mobile number to open your card" : "أضف اسمك ورقم جوالك لتكون بطاقتك معك"}</span></footer>
      {program.terms && <details className={s.terms}><summary>{en ? "Reward terms" : "شروط الحصول على المكافأة"}</summary><p>{program.terms}</p></details>}
    </section>
    <span className={s.powered}>{en ? "Powered by Branda" : "بواسطة برندة"}</span>
  </main>;
}
