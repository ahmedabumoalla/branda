"use client";

import Link from "next/link";
import { BarndaksaLogo } from "@/components/ui/barndaksa-logo";
import { CashierSystemSwitch } from "./cashier-system-switch";
import { CashierLanguageSwitch, useCashierLanguage } from "./cashier-language";
import styles from "../finance/finance-login.module.css";

export function CashierAccessPicker() {
  const { t, dir, locale } = useCashierLanguage();
  return <main dir={dir} lang={locale} className={styles.pickerPage}>
    <section className={styles.pickerPanel} aria-labelledby="cashier-access-title">
      <div className={styles.loginToolbar}><BarndaksaLogo width={150} height={60} /><CashierLanguageSwitch /></div>
      <p className={styles.kicker}>{t("مساحة فريق العلامة")}</p>
      <h1 id="cashier-access-title">{t("دخول الكاشيرات")}</h1>
      <p className={styles.hint}>{t("اختر نوع حسابك للدخول إلى مساحة عملك")}</p>
      <CashierSystemSwitch />
      <Link className={styles.switchLink} href="/login">{t("دخول إدارة العلامة")}</Link>
    </section>
  </main>;
}
