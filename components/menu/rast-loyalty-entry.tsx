import Link from "next/link";
import { ArrowUpLeft, WalletCards } from "lucide-react";
import s from "./rast-loyalty-entry.module.css";

export function RastLoyaltyEntry() {
  return <section className={s.section} aria-label="بطاقة ولاء راست">
    <Link href="/loyalty/rast" className={s.entry} aria-label="حمّل بطاقة ولاء راست">
      <span className={s.cardIllustration} aria-hidden="true">
        <span className={s.cardBack} />
        <span className={s.cardFront}>
          <span className={s.cardTop}><span dir="ltr">RAST</span><WalletCards /></span>
          <span className={s.cardBrand}>راست</span>
          <span className={s.cardCaption}>بطاقة الولاء</span>
        </span>
      </span>
      <span className={s.copy}>
        <span className={s.eyebrow}>لأنك من أهل راست</span>
        <span className={s.title}>بطاقتك، معك في كل زيارة</span>
        <span className={s.description}>حمّل بطاقة الولاء وخلي لحظاتك معنا أقرب.</span>
      </span>
      <span className={s.action}>حمّل بطاقتك<ArrowUpLeft aria-hidden="true" /></span>
    </Link>
  </section>;
}
