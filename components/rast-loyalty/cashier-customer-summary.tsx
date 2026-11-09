"use client";

import type { CustomerSummaryState } from "@/lib/loyalty/customer-summary";
import type { LoyaltyReadOperation } from "@/lib/loyalty/read-operation-types";
import { useCashierLanguage } from "@/components/cashier/cashier-language";
import styles from "./rast-cashier.module.css";

export function CashierCustomerSummary({ state, saved, operation }: {
  state: CustomerSummaryState; saved: boolean; operation?: LoyaltyReadOperation;
}) {
  const { t, locale } = useCashierLanguage();
  if (state.status === "idle" && !saved) return null;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const completed = operation?.status === "succeeded";
  const failed = operation && ["failed", "needs_review", "duplicate"].includes(operation.status);
  const status = completed ? "تم تسجيل الختم" : failed ? operation.status === "duplicate" ? "عملية مكررة لم يُضف ختم" : "لم يتأكد تسجيل الختم راجع عدادات المزامنة" : saved ? "الختم قيد التسجيل" : "الرصيد الحالي";
  const unavailable = state.status === "unauthorized" ? "تحقق من جلسة الكاشير لعرض الرصيد" : state.status === "not_found" ? "لم تُوجد بطاقة متاحة لهذا الرقم" : null;
  return <section className={styles.customerSummary} role="status" aria-live="polite" aria-atomic="true" aria-label={t("ملخص العميل")} data-customer-summary="fast-v1">
    {state.summary ? <>
      <div className={styles.customerSummaryHeading}><strong>{state.summary.customerName}</strong><span>{t(status)}</span></div>
      <dl className={styles.customerSummaryStats}>
        <div><dt>{t("رصيد الأختام")}</dt><dd dir="ltr">{number(state.summary.stampsInCycle)} / {number(state.summary.purchasesRequired)}</dd></div>
        <div><dt>{t("المكافآت المتاحة")}</dt><dd>{number(state.summary.availableRewards)}</dd></div>
      </dl>
      {saved && !state.confirmed && !completed && <p>{t("آخر رصيد مؤكد يتحدث بعد اكتمال التسجيل")}</p>}
    </> : <div className={styles.customerSummaryPending}>
      {unavailable ? <p>{t(unavailable)}</p> : <span className={styles.customerSummarySpinner} role="img" aria-label={t("جارٍ عرض بيانات العميل")} data-summary-loading="compact" />}
      {saved && <p className={styles.customerSummaryStatus}>{t(status)}</p>}
    </div>}
  </section>;
}
