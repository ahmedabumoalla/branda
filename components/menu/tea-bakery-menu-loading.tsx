import Image from "next/image";
import { TEA_BAKERY_LOGO } from "@/lib/menu/tea-bakery";
import base from "./bistro-menu.module.css";
import s from "./tea-bakery-menu.module.css";

export function TeaBakeryMenuLoading() {
  return <main className={`${base.menu} ${s.menu} ${s.loading}`} data-tea-bakery dir="rtl" aria-busy="true"><div className={s.loadingSeal}><Image src={TEA_BAKERY_LOGO} width={320} height={320} unoptimized alt="Tea & Bakery" loading="eager" /></div><p className={s.loadingTitle} lang="en" dir="ltr">Tea &amp; Bakery</p><p role="status">لحظة ونجهّز لك القائمة</p></main>;
}
