"use client";

import Image from "next/image";
import { signatureAsset, type SignatureBrand } from "@/lib/menu/signature-brands";
import s from "./signature-menu.module.css";

export function SignatureMenuLoading({ brand }: { brand: SignatureBrand }) {
  return <main className={`${s.menu} ${s.loading}`} data-signature={brand.key} dir="rtl" aria-busy="true"><div className={s.loadingCenter}><span className={s.mark} data-mark={brand.key}><Image src={signatureAsset(brand.logo)} width={800} height={500} unoptimized alt={brand.name} loading="eager" /></span><span className={s.signature} dir="ltr">{brand.signature}</span><h1>لحظتك على ذوقك</h1><div className={s.loadingLine} aria-hidden="true" /><p role="status">نجهّز لك اختيارات {brand.arabic}</p></div></main>;
}
