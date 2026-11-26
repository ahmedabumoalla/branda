import { loyaltyText, type LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import { StampGlyph } from "./stamp-glyph";
import { stampLogoUrl, type LoyaltyStampStyle } from "@/lib/loyalty/stamp-style";
import { Check, Gift } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { RastBrand } from "./rast-brand";
import { RastQrCode } from "./qr-code";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName, loyaltyTheme } from "./loyalty-theme";
import { brandStampStyle } from "@/lib/loyalty/brand-stamp-artwork";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { FawaselLoyaltyCard } from "@/components/store/fawasel-loyalty-card";

type Props = {
  language?: LoyaltyLanguage;
  identity: LoyaltyIdentity;
  customerName?: string;
  stamps: number;
  required: number;
  rewardName: string;
  cardCode?: string;
  displayNumber?: string;
  stampStyle?: LoyaltyStampStyle;
  preview?: boolean;
  details?: ReactNode;
};

export function RastStampCard({ language = "ar", identity, customerName, stamps, required, rewardName, cardCode, displayNumber, stampStyle, preview = false, details }: Props) {
  const en = language === "en";
  const logoUrl = identity.logoDisplayUrl || identity.logoUrl;
  const stampLogo = logoUrl ? stampLogoUrl(identity.slug, identity.branchId) : null;
  if (isFawaselStore(identity.slug)) return <FawaselLoyaltyCard background={identity.cardBackground} foreground={identity.cardForeground} accent={identity.cardAccent} stampStyle={brandStampStyle(identity.slug, stampStyle)} stampLogo={stampLogo} logoUrl={logoUrl} customerName={customerName} stamps={stamps} required={required} rewardName={rewardName} cardCode={cardCode} displayNumber={displayNumber} preview={preview} details={details} />;
  const goal = Math.max(1, Math.min(100, Math.trunc(required)));
  const collected = Math.max(0, Math.min(goal, Math.trunc(stamps)));
  const selectedStyle = brandStampStyle(identity.slug, stampStyle);
  const balanced = identity.slug !== "rast" && goal <= 10;
  const columns = Math.ceil(goal / Math.ceil(goal / 5));
  return <section className={s.stampCard} style={loyaltyTheme(identity)} aria-label={en ? "Loyalty card" : `${preview ? "معاينة بطاقة" : "بطاقة"} ${loyaltyCommunityName(identity)}`}>
    <div className={s.cardTop}><RastBrand locale={language} identity={identity} light /><span className={s.cardCaption}>{en ? (preview ? "Card preview" : "Loyalty card") : preview ? "معاينة البطاقة" : identity.slug === "rast" ? "قهوة تجمعنا" : "زيارتك لها مكافأة"}</span></div>
    <div className={s.cardIdentity}><p>{customerName || (en ? "Your loyalty card" : `مكانك بين ${loyaltyCommunityName(identity)}`)}</p><span>{en ? "Every visit brings you closer to your reward" : "كل زيارة تقرّبك من هديتك"}</span></div>
    <div className={s.stampHeading}><span>{en ? "Visits" : "رصيد الزيارات"}</span><strong dir="ltr"><b>{collected}</b><span> / {goal}</span></strong></div>
    <ol className={`${s.stamps} ${goal > 10 ? s.manyStamps : ""} ${balanced ? s.balancedStamps : ""}`} data-plant-stamps={selectedStyle === "plant" ? true : undefined} style={balanced ? { "--stamp-columns": columns } as CSSProperties : selectedStyle === "plant" && goal <= 5 ? { gridTemplateColumns: `repeat(${goal}, minmax(0, 1fr))` } : undefined} aria-label={en ? `${collected} of ${goal} stamps` : `${collected} من ${goal} أختام مكتملة`}>
      {Array.from({ length: goal }, (_, index) => <li key={index} className={index < collected ? s.collected : ""} aria-label={en ? `Stamp ${index + 1}, ${index < collected ? "collected" : "empty"}` : `الختم ${index + 1}${index < collected ? " مكتمل" : " لم يكتمل"}`}>
        <StampGlyph style={selectedStyle} logoUrl={logoUrl} stampLogo={stampLogo} />
        {index < collected && <Check className={s.stampCheck} aria-hidden="true" />}
      </li>)}
    </ol>
    <div className={s.cardReward}><Gift aria-hidden="true" /><div><span>{en ? "Reward for a full card" : "عند اكتمال الأختام"}</span><strong>{loyaltyText(rewardName, language)}</strong></div></div>
    {details}
    {cardCode ? <div className={s.memberQr}><RastQrCode value={cardCode} label={en ? "Show this code to collect stamps" : "رمز بطاقتك لجمع الأختام عند الكاشير"} /><div><strong>{en ? "Collect your stamp" : "ختمك يبدأ من هنا"}</strong><p>{en ? "Show this code to the cashier" : "اعرض الرمز للكاشير عند زيارتك"}</p><span dir="ltr">{displayNumber || cardCode}</span></div></div> : null}
    <div className={s.cardFoot}><span>{identity.slug === "rast" ? "KAWAKIB COFFEE" : loyaltyText(identity.name, language)}</span><span>{en ? "Every visit counts" : "لحظاتك لها مكافأة"}</span></div>
  </section>;
}
