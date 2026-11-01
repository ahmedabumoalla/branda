import { TogetherBrandMark } from "@/components/store/together-brand-mark";
import styles from "./together-store-loading.module.css";

/** The real storefront replaces this Suspense fallback as soon as it is ready. */
export function TogetherStoreLoading() {
  return <main className={styles.screen} dir="rtl" aria-busy="true" aria-label="متجر توقذر بلانتس" data-together-loading="botanical-opening" data-loading-design="forest-atelier">
    <div className={styles.garden} aria-hidden="true" />
    <div className={styles.light} aria-hidden="true" />
    <div className={styles.contours} aria-hidden="true"><span /><span /></div>
    <div className={styles.prologue} aria-hidden="true"><span />عالم الغراس والهدايا<span /></div>
    <div className={styles.content}>
      <TogetherBrandMark className={styles.completeMark} />
      <h1 className={styles.title}><span className={styles.titleLine}>كل بداية</span><span className={styles.titleBloom}>تنبت حكاية</span></h1>
      <div className={styles.track} role="progressbar" aria-label="تحميل متجر توقذر بلانتس"><span /></div>
      <p className={styles.status} role="status">نفتح لك عالم الغراس والهدايا</p>
    </div>
    <p className={styles.signature}><span />معًا نزرع حياة<span /></p>
  </main>;
}
