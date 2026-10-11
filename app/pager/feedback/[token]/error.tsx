"use client";

import styles from "@/components/pager/pager.module.css";

export default function FeedbackError({ reset }: { reset: () => void }) {
  return <main className={`${styles.root} ${styles.feedback}`} dir="rtl"><h1 className={styles.title}>تعذر تحميل صفحة التقييم</h1><p className={styles.muted}>تحقق من الاتصال ثم حاول فتح التقييم مرة أخرى</p><button className={styles.button} style={{ marginTop: 20 }} onClick={reset}>إعادة المحاولة</button></main>;
}
