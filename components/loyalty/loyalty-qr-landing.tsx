import Image from "next/image";
import { ArrowUpLeft, Gift, ScanLine, ShieldCheck } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { RastQrCode } from "@/components/rast-loyalty/qr-code";
import { loyaltyTheme } from "@/components/rast-loyalty/loyalty-theme";
import { brandStampArtwork } from "@/lib/loyalty/brand-stamp-artwork";
import { TogetherBrandMark } from "@/components/store/together-brand-mark";
import s from "./loyalty-qr-landing.module.css";

type Props = { identity: LoyaltyIdentity; program: { purchasesRequired: number; rewardName: string; terms: string }; signupUrl: string };

export function LoyaltyQrLanding({ identity, program, signupUrl }: Props) {
  const plant = brandStampArtwork(identity.slug);
  const logo = identity.logoDisplayUrl || identity.logoUrl;
  return <main className={s.page} style={loyaltyTheme(identity)} dir="rtl" data-botanical={Boolean(plant)}>
    <div className={s.ambient} aria-hidden="true" />
    <section className={s.poster} aria-labelledby="loyalty-title">
      <header className={s.brand}>
        {plant ? <TogetherBrandMark className={s.botanicalMark} /> : logo && <Image src={logo} alt={`شعار ${identity.name}`} width={180} height={110} unoptimized className={s.logo} />}
        <p>{identity.name}</p><span>الولاء والمكافآت</span>
      </header>
      <div className={s.story}>
        <span className={s.eyebrow}><Gift size={17} aria-hidden="true" />مكانك معنا له مكافأة</span>
        <h1 id="loyalty-title">زياراتك تكبر<span>ومكافأتك تقرّب</span></h1>
        <p>اجمع <strong>{program.purchasesRequired} أختام</strong> واستمتع بمكافأتك</p>
        <div className={s.reward}>{logo && <Image src={plant ? "/together/logo.webp" : logo} alt={`شعار ${identity.name}`} width={48} height={48} unoptimized />}<div><span>مكافأتك القادمة</span><strong>{program.rewardName}</strong></div></div>
      </div>
      <div className={s.scan}>
        <div className={s.qrFrame}><RastQrCode value={signupUrl} label={`رمز التسجيل في ولاء ${identity.name}`} /></div>
        <h2><ScanLine size={20} aria-hidden="true" />امسح الرمز وابدأ رحلتك</h2>
        <p>يفتح بطاقة الولاء لتسجيلك أو الوصول إلى بطاقتك</p>
        <a href={signupUrl} className={s.join}>افتح بطاقة الولاء<ArrowUpLeft size={19} aria-hidden="true" /></a>
        <span className={s.sameDevice}>تتصفح من جوالك؟ افتح البطاقة مباشرة من الزر</span>
      </div>
      <footer className={s.footer}><ShieldCheck size={16} aria-hidden="true" /><span>أضف اسمك ورقم جوالك لتكون بطاقتك معك</span></footer>
      {program.terms && <details className={s.terms}><summary>شروط الحصول على المكافأة</summary><p>{program.terms}</p></details>}
    </section>
    <span className={s.powered}>بواسطة برندة</span>
  </main>;
}
