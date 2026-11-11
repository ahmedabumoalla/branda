import Image from "next/image";
import Link from "next/link";
import type { StandaloneMenu } from "@/lib/menu/standalone-menu";
import s from "./jamila-menu.module.css";

export const JAMILA_SLUG = "brand-406bf519a458";
export const JAMILA_LOGO = "/menu-art/jamila/logo-v1.png";

/** No sample products; normal catalog routing resumes when products are published. */
export function JamilaMenu({ menu, loyalty }: { menu: StandaloneMenu; loyalty: { purchasesRequired: number; rewardName: string } | null }) {
  return <main className={s.page} dir="rtl">
    <header className={s.header}><span lang="en" dir="ltr">JAMILA</span><span>قهوة ومخبوزات</span></header>
    <section className={s.hero} aria-labelledby="jamila-title">
      <Image className={s.logo} src={menu.logoUrl || JAMILA_LOGO} alt="Jamila Bakery & CoffeeHouse" width={1968} height={800} unoptimized loading="eager" />
      <div className={s.intro}><span className={s.eyebrow}>أهلًا بك في جميلة</span><h1 id="jamila-title">للحظات الجميلة</h1><p>قهوة ومخبوزات ولحظة على مهل</p></div>
      <div className={s.coming}><span className={s.rule} aria-hidden="true" /><h2>قائمتنا قريبًا</h2><p>نجهّز لك اختياراتنا بكل محبة</p></div>
      {loyalty && <aside className={s.loyalty} aria-label="برنامج ولاء جميلة"><div><span className={s.eyebrow}>كل زيارة تزيد المحبة</span><h2>لك مكان بين أهل جميلة</h2><p>اجمع {loyalty.purchasesRequired} أختام واستمتع بمكافأتك</p><strong>{loyalty.rewardName}</strong></div><Link className={s.button} href={`/loyalty/${menu.slug}/qr`}>بطاقة الولاء <span aria-hidden="true">↖</span></Link></aside>}
    </section>
    <footer className={s.footer}><span lang="en" dir="ltr">BAKERY &amp; COFFEEHOUSE</span><span>جميلة بكل تفاصيلها</span></footer>
  </main>;
}
