"use client";

import Link from "next/link";
import { Monitor, WalletCards } from "lucide-react";
import { useCashierLanguage } from "./cashier-language";
import styles from "./cashier-system-switch.module.css";

export function CashierSystemSwitch({ active }: { active?: "loyalty" | "sales" }) {
  const { t, dir } = useCashierLanguage();
  return <nav className={styles.systems} aria-label={t("اختيار نظام الكاشير")} dir={dir}>
    <Link href="/cashier/login?type=loyalty" className={styles.system} aria-current={active === "loyalty" ? "page" : undefined}>
      <WalletCards aria-hidden="true" />
      <span>{t("نظام الولاء والبطاقات")}</span>
    </Link>
    <Link href="/cashier/login?type=sales" className={styles.system} aria-current={active === "sales" ? "page" : undefined}>
      <Monitor aria-hidden="true" />
      <span>{t("نقاط البيع")}</span>
    </Link>
  </nav>;
}
