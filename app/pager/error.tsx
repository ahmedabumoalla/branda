"use client";

import Link from "next/link";
import styles from "@/components/pager/pager.module.css";
import { CashierLanguageSwitch, useCashierLanguage } from "@/components/cashier/cashier-language";

export default function PagerError({ reset }: { reset: () => void }) {
  const { t, dir, locale } = useCashierLanguage();
  return <main className={`${styles.root} ${styles.feedback}`} dir={dir} lang={locale}><CashierLanguageSwitch /><h1 className={styles.title}>{t("تعذر تحميل نظام النداء")} </h1><p className={styles.muted}>{t("تحقق من الاتصال وصلاحية دخولك ثم حاول مجددًا")} </p><div className={styles.tools} style={{ marginTop: 24 }}><button className={styles.button} onClick={reset}>{t("إعادة المحاولة")} </button><Link className={styles.secondary} href="/cashier/login">{t("تسجيل الدخول")} </Link></div></main>;
}
