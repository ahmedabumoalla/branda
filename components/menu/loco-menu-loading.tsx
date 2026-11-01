import Image from "next/image";
import styles from "./loco-menu-loading.module.css";

/** Suspense removes this immediately when the menu is ready, without a timer. */
export function LocoMenuLoading() {
  return (
    <main dir="rtl" className={styles.screen} aria-busy="true" aria-label="منيو لوكو">
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.mark}>
          <Image src="/loco/logo.svg" alt="لوكو" width={1109} height={401} preload unoptimized className={styles.logo} />
        </div>
        <p className={styles.signature}>كل مزاج وله لوكو</p>
        <div className={styles.track} role="progressbar" aria-label="تحميل منيو لوكو">
          <span className={styles.sweep} />
        </div>
        <p className={styles.status} role="status" aria-live="polite">جارٍ تحميل منيو لوكو</p>
      </div>
      <span className={styles.corner} aria-hidden="true">LOCO / MENU</span>
    </main>
  );
}
