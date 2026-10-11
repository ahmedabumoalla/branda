"use client";

import styles from "@/components/pager/pager.module.css";

export default function OwnerPagerError({ reset }: { reset: () => void }) {
  return <section className={styles.root} dir="rtl"><h1 className={styles.title}>تعذر تحميل نظام البيجر</h1><p className={styles.muted}>تحقق من الاتصال وحاول مجددًا</p><button className={styles.button} style={{ marginTop: 20 }} onClick={reset}>إعادة المحاولة</button></section>;
}
