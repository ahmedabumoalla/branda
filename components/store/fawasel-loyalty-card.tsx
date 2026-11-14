import { Check, Shirt, Gift } from "lucide-react";
import type { ReactNode } from "react";
import { RastQrCode } from "@/components/rast-loyalty/qr-code";
import s from "./fawasel-loyalty-card.module.css";
import { FawaselBrandMark } from "./fawasel-brand-mark";

export function FawaselLoyaltyCard({ customerName, stamps, required, rewardName, cardCode, displayNumber, preview, details, logoUrl }: {
  customerName?: string; stamps: number; required: number; rewardName: string; cardCode?: string; displayNumber?: string; preview?: boolean; details?: ReactNode; logoUrl?: string | null;
}) {
  const goal = Math.max(1, Math.min(100, Math.trunc(required)));
  const collected = Math.max(0, Math.min(goal, Math.trunc(stamps)));
  return <section className={s.card} dir="rtl" aria-label={preview ? "معاينة بطاقة نادي فواصل" : "بطاقة نادي فواصل"}>
    <header className={s.header}><div><FawaselBrandMark logoUrl={logoUrl} /><span dir="ltr">FAWASEL MEMBER CLUB</span></div><span>{preview ? "معاينة البطاقة" : "أهل الستايل"}</span></header>
    <div className={s.identity}><p>{customerName || "لك مكان بين أهل فواصل"}</p><h2>ستايلك يستاهل<br /><em>أكثر</em></h2></div>
    <div className={s.balance}><span>رصيد أختامك</span><strong><b>{collected}</b><span> / {goal}</span></strong></div>
    <ol className={`${s.stamps} ${goal > 8 ? s.many : ""}`} aria-label={`${collected} من ${goal} أختام مكتملة`}>{Array.from({ length: goal }, (_, i) => <li key={i} className={i < collected ? s.collected : ""} aria-label={`الختم ${i + 1}${i < collected ? " مكتمل" : " لم يكتمل"}`}><Shirt aria-hidden="true" />{i < collected && <Check className={s.check} aria-hidden="true" />}</li>)}</ol>
    <div className={s.reward}><Gift aria-hidden="true" /><div><span>مكافأتك عند اكتمال الأختام</span><strong>{rewardName}</strong></div></div>
    {details}
    {cardCode && <div className={s.qr}><RastQrCode value={cardCode} label="رمز بطاقة فواصل لجمع الأختام" /><div><strong>ختمك يبدأ هنا</strong><p>اعرض بطاقتك للكاشير</p><span dir="ltr">{displayNumber || cardCode}</span></div></div>}
    <footer className={s.footer}><span dir="ltr">STYLE FOR EVERYDAY</span><span>فواصل تجمعنا</span></footer>
  </section>;
}
