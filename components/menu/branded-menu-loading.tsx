import Image from "next/image";
import type { CSSProperties } from "react";
import type { LoadingBrand } from "@/lib/menu/loading-brands";
import styles from "./branded-menu-loading.module.css";

export function BrandedMenuLoading({ brand }: { brand: LoadingBrand }) {
  const colors = { "--loading-bg": brand.background, "--loading-accent": brand.accent, "--loading-ink": brand.foreground } as CSSProperties;
  return (
    <main className={styles.screen} style={colors} dir="rtl" aria-busy="true" aria-label={brand.name}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.content}>
        <span className={styles.eyebrow}>{brand.salon ? "عناية تليق بك" : "لحظات بطعم مختلف"}</span>
        <div className={styles.identity}>
          {brand.logo ? (
            <Image src={brand.logo} alt={brand.name} width={420} height={300} unoptimized loading="eager" fetchPriority="high" className={brand.blend ? styles.blendedLogo : styles.logo} />
          ) : <span className={styles.wordmark} dir="ltr">Double <i>B</i></span>}
        </div>
        <div className={styles.copy}>
          <p className={styles.greeting}>{brand.greeting}</p>
          <span className={styles.progress} aria-hidden="true"><span /></span>
          <p className={styles.status} role="status">{brand.detail}</p>
        </div>
      </div>
      <span className={styles.signature} dir="ltr">{brand.name}</span>
    </main>
  );
}
