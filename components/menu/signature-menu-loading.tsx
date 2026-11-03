"use client";

import Image from "next/image";
import { signatureAsset, type SignatureBrand } from "@/lib/menu/signature-brands";
import s from "./signature-menu.module.css";

export function SignatureMenuLoading({ brand }: { brand: SignatureBrand }) {
  const welcome = brand.key === "korma" ? "رحلة نكهة تبدأ من هنا" : brand.key === "hadiqa" ? "اللمّة تحلى في الحديقة" : "لحظتك على ذوقك";
  return <main className={`${s.menu} ${s.loading}`} data-signature={brand.key} dir="rtl" aria-busy="true"><div className={s.loadingCenter}><span className={s.mark} data-mark={brand.key} data-cutout={brand.key === "once" || brand.key === "black"}><Image src={signatureAsset(brand.logo)} width={800} height={500} unoptimized alt={brand.name} loading="eager" /></span><span className={s.signature} dir="ltr">{brand.signature}</span><h1>{welcome}</h1><div className={s.loadingLine} aria-hidden="true" /><p role="status">نجهّز لك اختيارات {brand.arabic}</p></div></main>;
}
