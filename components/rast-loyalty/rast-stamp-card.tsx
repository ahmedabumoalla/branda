import { Check, Coffee, Gift } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { RastBrand } from "./rast-brand";
import { RastQrCode } from "./qr-code";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName, loyaltyTheme } from "./loyalty-theme";

type Props = {
  identity: LoyaltyIdentity;
  customerName?: string;
  stamps: number;
  required: number;
  rewardName: string;
  cardCode?: string;
  preview?: boolean;
};

export function RastStampCard({ identity, customerName, stamps, required, rewardName, cardCode, preview = false }: Props) {
  const goal = Math.max(1, Math.min(100, Math.trunc(required)));
  const collected = Math.max(0, Math.min(goal, Math.trunc(stamps)));
  return <section className={s.stampCard} style={loyaltyTheme(identity)} aria-label={`${preview ? "معاينة بطاقة" : "بطاقة"} ${loyaltyCommunityName(identity)}`}>
    <div className={s.cardTop}><RastBrand identity={identity} light /><span className={s.cardCaption}>{preview ? "معاينة البطاقة" : identity.slug === "rast" ? "قهوة تجمعنا" : "زيارتك لها مكافأة"}</span></div>
    <div className={s.cardIdentity}><p>{customerName || `مكانك بين ${loyaltyCommunityName(identity)}`}</p><span>كل زيارة تقرّبك من هديتك</span></div>
    <div className={s.stampHeading}><span>رصيد الزيارات</span><strong><b>{collected}</b><span> / {goal}</span></strong></div>
    <ol className={`${s.stamps} ${goal > 10 ? s.manyStamps : ""}`} aria-label={`${collected} من ${goal} أختام مكتملة`}>
      {Array.from({ length: goal }, (_, index) => <li key={index} className={index < collected ? s.collected : ""} aria-label={`الختم ${index + 1}${index < collected ? " مكتمل" : " لم يكتمل"}`}>
        {index < collected ? <><Coffee aria-hidden="true" /><Check className={s.stampCheck} aria-hidden="true" /></> : index === goal - 1 ? <Gift aria-hidden="true" /> : <Coffee aria-hidden="true" />}
      </li>)}
    </ol>
    <div className={s.cardReward}><Gift aria-hidden="true" /><div><span>عند اكتمال الأختام</span><strong>{rewardName}</strong></div></div>
    {cardCode ? <div className={s.memberQr}><RastQrCode value={cardCode} label="رمز بطاقتك لجمع الأختام عند الكاشير" /><div><strong>ختمك يبدأ من هنا</strong><p>اعرض الرمز للكاشير عند زيارتك</p><span dir="ltr">{cardCode}</span></div></div> : null}
    <div className={s.cardFoot}><span>{identity.slug === "rast" ? "KAWAKIB COFFEE" : identity.name}</span><span>لحظاتك لها مكافأة</span></div>
  </section>;
}
