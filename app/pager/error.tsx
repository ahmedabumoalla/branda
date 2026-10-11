"use client";

import Link from "next/link";
import styles from "@/components/pager/pager.module.css";

export default function PagerError({ reset }: { reset: () => void }) {
  return <main className={`${styles.root} ${styles.feedback}`} dir="rtl"><h1 className={styles.title}>تعذر تحميل نظام النداء</h1><p className={styles.muted}>تحقق من الاتصال وصلاحية دخولك ثم حاول مجددًا</p><div className={styles.tools} style={{ marginTop: 24 }}><button className={styles.button} onClick={reset}>إعادة المحاولة</button><Link className={styles.secondary} href="/cashier/login">تسجيل الدخول</Link></div></main>;
}
