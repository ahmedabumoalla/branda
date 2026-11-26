import type { LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import { Check, Shirt, Gift } from "lucide-react";
import type { ReactNode, CSSProperties } from "react";
import { RastQrCode } from "@/components/rast-loyalty/qr-code";
import s from "./fawasel-loyalty-card.module.css";
import { FawaselBrandMark } from "./fawasel-brand-mark";
import { StampGlyph } from "@/components/rast-loyalty/stamp-glyph";
import type { LoyaltyStampStyle } from "@/lib/loyalty/stamp-style";

export function FawaselLoyaltyCard({ language = "ar", customerName, stamps, required, rewardName, cardCode, displayNumber, preview, details, logoUrl, background, foreground, accent, stampStyle, stampLogo }: {
  language?: LoyaltyLanguage; customerName?: string; stamps: number; required: number; rewardName: string; cardCode?: string; displayNumber?: string; preview?: boolean; details?: ReactNode; logoUrl?: string | null; background?: string; foreground?: string; accent?: string; stampStyle?: LoyaltyStampStyle; stampLogo?: string | null;
}) {
  const en = language === "en";
  const goal = Math.max(1, Math.min(100, Math.trunc(required)));
  const collected = Math.max(0, Math.min(goal, Math.trunc(stamps)));
  return <section className={s.card} style={{ "--orange": accent || "#ff8500", background: background || undefined, color: foreground || undefined } as CSSProperties} lang={language} dir={en ? "ltr" : "rtl"} aria-label={en ? (preview ? "Fawasel Club card preview" : "Fawasel Club card") : preview ? "معاينة بطاقة نادي فواصل" : "بطاقة نادي فواصل"}>
    <header className={s.header}><div><FawaselBrandMark language={language} logoUrl={logoUrl} /><span dir="ltr">FAWASEL MEMBER CLUB</span></div><span>{en ? (preview ? "Card preview" : "Style club") : preview ? "معاينة البطاقة" : "أهل الستايل"}</span></header>
    <div className={s.identity}><p>{customerName || (en ? "Welcome to Fawasel Club" : "لك مكان بين أهل فواصل")}</p><h2>{en ? "Your style deserves" : "ستايلك يستاهل"}<br /><em>{en ? "more" : "أكثر"}</em></h2></div>
    <div className={s.balance}><span>{en ? "Your stamps" : "رصيد أختامك"}</span><strong><b>{collected}</b><span> / {goal}</span></strong></div>
    <ol className={`${s.stamps} ${goal > 8 ? s.many : ""}`} aria-label={en ? `${collected} of ${goal} stamps collected` : `${collected} من ${goal} أختام مكتملة`}>{Array.from({ length: goal }, (_, i) => <li key={i} className={i < collected ? s.collected : ""} aria-label={en ? `Stamp ${i + 1}, ${i < collected ? "collected" : "empty"}` : `الختم ${i + 1}${i < collected ? " مكتمل" : " لم يكتمل"}`}>{stampStyle === "brand" && logoUrl ? (stampLogo ? <StampGlyph style="brand" stampLogo={stampLogo} /> : <img src={logoUrl} alt="" style={{ width: 24, height: 24, objectFit: "contain" }} />) : stampStyle === "star" || stampStyle === "check" ? <StampGlyph style={stampStyle} /> : <Shirt aria-hidden="true" />}{i < collected && <Check className={s.check} aria-hidden="true" />}</li>)}</ol>
    <div className={s.reward}><Gift aria-hidden="true" /><div><span>{en ? "Reward for a full card" : "مكافأتك عند اكتمال الأختام"}</span><strong>{rewardName}</strong></div></div>
    {details}
    {cardCode && <div className={s.qr}><RastQrCode value={cardCode} label={en ? "Fawasel card code for collecting stamps" : "رمز بطاقة فواصل لجمع الأختام"} /><div><strong>{en ? "Collect your stamp" : "ختمك يبدأ هنا"}</strong><p>{en ? "Show your card at the checkout" : "اعرض بطاقتك للكاشير"}</p><span dir="ltr">{displayNumber || cardCode}</span></div></div>}
    <footer className={s.footer}><span dir="ltr">STYLE FOR EVERYDAY</span><span>{en ? "Together at Fawasel" : "فواصل تجمعنا"}</span></footer>
  </section>;
}
