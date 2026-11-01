import Image from "next/image";
import styles from "./together-store-loading.module.css";

/** The real storefront replaces this Suspense fallback as soon as it is ready. */
export function TogetherStoreLoading() {
  return <main className={styles.screen} dir="rtl" aria-busy="true" aria-label="متجر توقذر بلانتس" data-together-loading="botanical-opening">
    <div className={styles.light} aria-hidden="true" />
    <div className={styles.botanical} aria-hidden="true"><span /><span /><span /></div>
    <div className={styles.content}>
      <div className={styles.emblem}>
        <div className={styles.logoWindow}><Image src="/together/logo.webp" alt="شعار توقذر بلانتس" width={1000} height={983} preload unoptimized className={styles.logo} /></div>
        <span className={styles.leaf} aria-hidden="true" />
        <span className={styles.leafSmall} aria-hidden="true" />
      </div>
      <p className={styles.wordmark} dir="ltr">Together <em>Plants</em></p>
      <h1 className={styles.title}>كل بداية<br /><span>تنبت حكاية</span></h1>
      <div className={styles.track} role="progressbar" aria-label="تحميل متجر توقذر بلانتس"><span /></div>
      <p className={styles.status} role="status">نفتح لك عالم الغراس والهدايا</p>
    </div>
    <p className={styles.signature}><span />معًا نزرع حياة<span /></p>
  </main>;
}
