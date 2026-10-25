"use client";

import { ChevronLeft } from "lucide-react";
import type { FinanceSnapshot } from "@/lib/finance/brand-finance";
import { accountKindNames } from "./finance-ui";
import styles from "./finance-trial-balance.module.css";

const amount = new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FinanceTrialBalance({ lines, onSelectAccount }: {
  lines: FinanceSnapshot["trialBalance"];
  onSelectAccount: (accountId: string) => void;
}) {
  return <div className={styles.ledger}>
    <div className={styles.guide}>
      <span>اختر الحساب لعرض كشف الحركة</span>
      <span>جميع المبالغ بالريال السعودي</span>
    </div>
    <div className={styles.scroll} role="region" aria-label="ميزان المراجعة" tabIndex={0}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>أرصدة الحسابات وحركة المدين والدائن بالريال السعودي</caption>
        <colgroup><col className={styles.accountColumn} /><col className={styles.kindColumn} /><col /><col /><col /></colgroup>
        <thead><tr><th scope="col">الحساب</th><th scope="col">نوع الحساب</th><th scope="col">مدين</th><th scope="col">دائن</th><th scope="col">الرصيد</th></tr></thead>
        <tbody>{lines.map((line) => <tr key={line.account_id}>
          <th scope="row">
            <button type="button" className={styles.account} onClick={() => onSelectAccount(line.account_id)} aria-label={`كشف حساب ${line.name}`}>
              <span>{line.name}</span><ChevronLeft size={16} aria-hidden="true" />
            </button>
          </th>
          <td className={styles.kind}>{accountKindNames[line.kind]}</td>
          {[line.debit, line.credit, line.balance].map((value, index) => <td key={index} className={`${styles.money} ${value === 0 ? styles.zero : ""} ${index === 2 ? styles.balance : ""}`}>
            <bdi dir="ltr">{amount.format(value)}</bdi>
          </td>)}
        </tr>)}</tbody>
      </table>
      {lines.length === 0 && <p className={styles.empty}>لا توجد أرصدة حسابات لعرضها</p>}
    </div>
  </div>;
}
