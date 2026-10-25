"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchFinanceTerminalFeeHistoryAction } from "@/app/actions/finance-treasury";
import type { TreasuryAccount, TreasuryFeeCharge } from "@/lib/finance/treasury";
import { downloadFinanceCsv, financeDate, Numeric } from "./finance-ui";
import styles from "./finance-treasury.module.css";

export function FinanceTerminalFees({ account, charges, slug }: { account: TreasuryAccount; charges: TreasuryFeeCharge[]; slug?: string }) {
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ accountId: string; slug?: string; charges: TreasuryFeeCharge[]; offset: number; retry: number; data?: { rows: TreasuryFeeCharge[]; total: number }; error?: string } | null>(null);
  const current = response?.accountId === account.id && response?.slug === slug && response?.charges === charges && response?.offset === offset && response?.retry === retry;
  const loading = !current;
  const error = current ? response?.error ?? "" : "";
  const history = current ? response?.data : undefined;
  useEffect(() => {
    let active = true;
    const request = { accountId: account.id, slug, charges, offset, retry };
    void fetchFinanceTerminalFeeHistoryAction(account.id, offset, slug).then((result) => {
      if (!active) return;
      setResponse(result.ok ? { ...request, data: result.data } : { ...request, error: result.message });
    }).catch(() => { if (active) setResponse({ ...request, error: "تعذر تحميل رسوم الشبكة أعد المحاولة" }); });
    return () => { active = false; };
  }, [account.id, offset, slug, charges, retry]);
  const rows = history?.rows ?? [];
  return <div className={styles.document}>
    <div className={styles.note}>رسوم الشبكة وضريبتها على العلامة تظهر المستحقات هنا حتى يُسجّل خصمها الفعلي من الإيداع أو الحساب البنكي</div>
    <div className={styles.toolbar}><strong>تفاصيل عمولات الشبكة والاشتراكات</strong><button disabled={loading || !!error || !rows.length} className={styles.secondary} onClick={() => downloadFinanceCsv("network-fees.csv", [
      ["نقطة الشبكة", "الحساب البنكي", "المصدر", "العمولة أو الاشتراك", "ضريبة الرسوم", "الإجمالي", "المخصوم فعليًا", "المستحق"],
      ...rows.map((row) => [row.terminal_name, row.bank_name, (row.kind === "monthly" ? row.billing_month : row.source_number) ?? "", row.fee, row.tax, row.total, row.paid, row.remaining]),
    ])}><Download size={16} aria-hidden="true" />تصدير الصفحة</button></div>
    {loading ? <p role="status">جار تحميل الرسوم</p> : error ? <div role="alert" className={styles.error}>{error}<button className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>إعادة المحاولة</button></div> : <>
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="رسوم نقطة الشبكة والحساب البنكي"><table className={styles.table}>
      <thead><tr><th>نقطة الشبكة والبنك</th><th>المصدر</th><th>العمولة أو الاشتراك</th><th>ضريبة الرسوم</th><th>الإجمالي</th><th>المخصوم فعليًا</th><th>المستحق</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td><strong>{row.terminal_name}</strong><small>{row.bank_name}</small></td>
        <td>{row.kind === "monthly" ? `اشتراك شهر ${row.billing_month?.slice(0, 7) ?? ""}` : `فاتورة #${row.source_number ?? "—"}`}<small>{financeDate(row.created_at)}</small></td>
        <td><Numeric value={row.fee} money />{row.kind === "transaction" && <small><Numeric value={row.fee_percent} />٪ من <Numeric value={row.base_amount} money /></small>}</td>
        <td><Numeric value={row.tax} money /><small><Numeric value={row.vat_rate} />٪</small></td>
        <td><Numeric value={row.total} money /></td><td><Numeric value={row.paid} money /></td><td><Numeric value={row.remaining} money /></td>
      </tr>)}</tbody>
    </table>{rows.length === 0 && <p className={styles.empty}>لا توجد رسوم مسجلة لهذا الحساب</p>}</div>
    <div className={styles.toolbar}><span>{history?.total ?? 0} سجل</span><div className={styles.actions}><button className={styles.secondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>السابق</button><button className={styles.secondary} disabled={offset + rows.length >= (history?.total ?? 0)} onClick={() => setOffset(offset + 100)}>التالي</button></div></div>
    </>}
  </div>;
}
