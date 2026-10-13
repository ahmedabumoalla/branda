"use client";
import { logoutCashierAction } from "@/app/actions/cashier";
import { CashierLanguageSwitch, useCashierLanguage } from "./cashier-language";
import styles from "@/components/pager/pager.module.css";
export function CashierServiceUnavailable() {
  const { t, dir, locale } = useCashierLanguage();
  return <main className={`${styles.root} ${styles.feedback}`} dir={dir} lang={locale}><CashierLanguageSwitch /><h1 className={styles.title}>{t("نظام النداء غير متاح الآن")}</h1><p className={styles.muted}>{t("تحقق من صلاحية الاستدعاء والاشتراك لدى إدارة العلامة أو سجل الدخول من جديد")}</p><form action={logoutCashierAction} style={{ marginTop: 20 }}><button className={styles.button} type="submit">{t("تسجيل الدخول من جديد")}</button></form></main>;
}
