import { Coffee } from "lucide-react";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import type { LoyaltyIdentity, LoyaltyMemberCard } from "@/lib/loyalty/experience-types";
import s from "./brand-loyalty.module.css";

export function BrandLoyaltyCard({ identity, member }: { identity: LoyaltyIdentity; member: LoyaltyMemberCard }) {
  return <article className={s.card} aria-label={`بطاقة ${identity.name}، ${member.stamps} من ${member.required} أختام`}>
    <div className={s.cardTop}>
      <div><span className={s.cardEyebrow}>لأهل {identity.name}</span><h2>{member.customerName || "بطاقة الولاء"}</h2></div>
      {identity.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */
        <img className={s.logo} src={identity.logoUrl} alt={identity.name} /> : <span className={s.wordmark}>{identity.name}</span>}
    </div>
    <div className={s.stamps} aria-hidden="true">
      {Array.from({ length: member.required }, (_, index) => <span className={index < member.stamps ? s.stamped : s.emptyStamp} key={index}><Coffee strokeWidth={1.4} /></span>)}
    </div>
    <div className={s.cardBottom}>
      <div><p className={s.progress}>{member.stamps}<span> / {member.required} أختام</span></p><p className={s.rewardName}>{member.rewardName}</p><p className={s.cardHint}>كل زيارة تقرّبك من مكافأتك</p></div>
      <div className={s.cardQr}><SecureQrCode kind="loyalty-card" value={member.cardCode} title="باركود العضوية" fit /><bdi>{member.cardCode}</bdi></div>
    </div>
  </article>;
}
