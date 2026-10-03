import { Check, Coffee, Gift } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import { RastBrand } from "./rast-brand";
import { RastQrCode } from "./qr-code";
import s from "./rast-loyalty.module.css";

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
  return <section className={s.stampCard} aria-label={preview ? "معاينة بطاقة أهل راست" : "بطاقة أهل راست"}>
    <div className={s.cardTop}><RastBrand identity={identity} light /><span className={s.cardCaption}>{preview ? "معاينة البطاقة" : "قهوة تجمعنا"}</span></div>
    <div className={s.cardIdentity}><p>{customerName || "مكانك بين أهل راست"}</p><span>كل زيارة تقرّبك من هديتك</span></div>
    <div className={s.stampHeading}><span>رصيد الزيارات</span><strong><b>{collected}</b><span> / {goal}</span></strong></div>
    <ol className={`${s.stamps} ${goal > 10 ? s.manyStamps : ""}`} aria-label={`${collected} من ${goal} أختام مكتملة`}>
      {Array.from({ length: goal }, (_, index) => <li key={index} className={index < collected ? s.collected : ""} aria-label={`الختم ${index + 1}${index < collected ? "، مكتمل" : "، لم يكتمل"}`}>
        {index < collected ? <><Coffee aria-hidden="true" /><Check className={s.stampCheck} aria-hidden="true" /></> : index === goal - 1 ? <Gift aria-hidden="true" /> : <Coffee aria-hidden="true" />}
      </li>)}
    </ol>
    <div className={s.cardReward}><Gift aria-hidden="true" /><div><span>عند اكتمال الأختام</span><strong>{rewardName}</strong></div></div>
    {cardCode ? <div className={s.memberQr}><RastQrCode value={cardCode} label="رمز بطاقتك لجمع الأختام عند الكاشير" /><div><strong>ختمك يبدأ من هنا</strong><p>اعرض الرمز للكاشير عند زيارتك.</p><span dir="ltr">{cardCode}</span></div></div> : null}
    <div className={s.cardFoot}><span>RAST COFFEE</span><span>لحظاتك، لها مكافأة.</span></div>
  </section>;
}
