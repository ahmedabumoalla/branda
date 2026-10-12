import Image from "next/image";
import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import s from "./rast-loyalty.module.css";
import { loyaltyCommunityName } from "./loyalty-theme";

export function RastBrand({ identity, light = false }: { identity: LoyaltyIdentity; light?: boolean }) {
  return <div className={`${s.brand} ${light ? s.brandLight : ""}`}>
    {identity.logoUrl || identity.slug === "rast" ? <Image src={identity.logoDisplayUrl || identity.logoUrl || "/menu-logos/kawakib-transparent-20261008.png"} alt={identity.name} width={144} height={78} className={s.logo} unoptimized /> : <strong className={s.logoFallback}>{identity.name}</strong>}
    <span>{loyaltyCommunityName(identity)}</span>
  </div>;
}

export function RastHeader({ identity }: { identity: LoyaltyIdentity }) {
  return <header className={s.publicHeader}>
    <RastBrand identity={identity} />
    <Link href={`/menu/${identity.slug}`} className={s.menuLink}>قائمة {identity.name} <ArrowUpLeft aria-hidden="true" /></Link>
  </header>;
}
