import { hasLoyaltyLanguageChoice, loyaltyText, type LoyaltyLanguage } from "@/lib/loyalty/customer-language";
import { LoyaltyLanguageLink } from "./loyalty-language-link";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName } from "./loyalty-theme";
import { isFawaselStore } from "@/lib/commerce/fawasel-profile";
import { FawaselBrandMark } from "@/components/store/fawasel-brand-mark";

export function RastBrand({ identity, light = false, locale = "ar" }: { identity: LoyaltyIdentity; light?: boolean; locale?: "ar" | "en" }) {
  return <div className={`${s.brand} ${light ? s.brandLight : ""}`}>
    {isFawaselStore(identity.slug) ? <FawaselBrandMark logoUrl={identity.logoDisplayUrl || identity.logoUrl} /> : identity.logoUrl || identity.slug === "rast" ? <Image src={identity.logoDisplayUrl || identity.logoUrl || "/menu-logos/kawakib-transparent-20261008.png"} alt={loyaltyText(identity.name, locale)} width={144} height={78} className={s.logo} unoptimized /> : <strong className={s.logoFallback}>{loyaltyText(identity.name, locale)}</strong>}
    <span>{locale === "en" ? `${loyaltyText(identity.nameEn || identity.name, locale)} community` : loyaltyCommunityName(identity)}</span>
  </div>;
}

export function RastHeader({ identity, language = "ar" }: { identity: LoyaltyIdentity; language?: LoyaltyLanguage }) {
  return <header className={s.publicHeader}>
    <RastBrand identity={identity} locale={language} />
    {hasLoyaltyLanguageChoice(identity.slug) && <LoyaltyLanguageLink language={language} />}
    <Link href={`/menu/${identity.slug}`} className={s.menuLink}>{language === "en" ? "Menu" : isFawaselStore(identity.slug) ? "متجر" : "قائمة"} {loyaltyText(identity.name, language)} <ArrowUpLeft aria-hidden="true" /></Link>
  </header>;
}
