import Image from "next/image";
import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import type { LoyaltyIdentity } from "@/lib/loyalty/experience-types";
import s from "./rast-loyalty.module.css";

export function RastBrand({ identity, light = false }: { identity: LoyaltyIdentity; light?: boolean }) {
  return <div className={`${s.brand} ${light ? s.brandLight : ""}`}>
    <Image src={identity.logoUrl || "/menu-logos/rast-wordmark-transparent-v2.png"} alt={identity.name} width={144} height={78} className={s.logo} unoptimized />
    <span>أهل راست</span>
  </div>;
}

export function RastHeader({ identity }: { identity: LoyaltyIdentity }) {
  return <header className={s.publicHeader}>
    <RastBrand identity={identity} />
    <Link href="/menu/rast" className={s.menuLink}>قائمة راست <ArrowUpLeft aria-hidden="true" /></Link>
  </header>;
}
