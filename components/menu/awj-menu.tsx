import Image from "next/image";
import { ArrowDownLeft } from "lucide-react";
import { AWJ_ASSETS } from "@/lib/menu/awj";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import { BrandLoyaltyEntry } from "./brand-loyalty-entry";
import { AwjCatalog } from "./awj-catalog";
import s from "./awj.module.css";

export function AwjMenu({ menu, loyalty }: { menu: StandaloneMenu; loyalty: boolean }) {
  const logo = menu.logoUrl || `${AWJ_ASSETS}/logo.png`;
  return <main dir="rtl" className={s.page}>
    <section className={s.hero} aria-labelledby="awj-title">
      <Image className={s.cover} src={AWJ_ASSETS + "/hero.webp"} alt="" fill preload unoptimized />
      <div className={s.heroInner}>
        <Image className={s.mark} src={logo} alt={menu.name} width={118} height={104} unoptimized />
        <div className={s.intro}><h1 id="awj-title">قهوتك<br /><em>على القمّة</em></h1>
          <a className={s.cta} href="#awj-menu">تصفّح المنيو <ArrowDownLeft size={19} aria-hidden /></a>
        </div>
      </div>
    </section>
    <div className={s.body}>
      {loyalty && <BrandLoyaltyEntry className={s.loyalty} slug={menu.slug} name={menu.name} logoUrl={logo}
        eyebrow="ولاء أوج" description="اجمع أختامك مع كل زيارة لأوج" palette={{
          background: "#30211f", foreground: "#fff9f0", muted: "#ecddd4", cardBackground: "#faf6ef",
          cardForeground: "#8d1926", cardBack: "#ce5662", actionBackground: "#fff9f0", actionForeground: "#8d1926",
        }} />}
      <AwjCatalog menu={menu} />
      <footer className={s.foot}><span>يرجى إبلاغنا بأي حساسية غذائية</span><b lang="en" dir="ltr">AWJ CAFE</b></footer>
    </div>
  </main>;
}
