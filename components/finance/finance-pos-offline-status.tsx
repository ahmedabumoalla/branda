"use client";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import type { usePosFinance } from "./use-pos-finance";
import styles from "./finance.module.css";

export function FinancePosOfflineStatus({ state }: { state: ReturnType<typeof usePosFinance>["offline"] }) {
  const conflicts = state.pending.filter(sale => sale.status === "conflict");
  return <section className={styles.panel} aria-label="حالة الحفظ والمزامنة" style={{ padding: "12px 18px", marginBottom: 16 }}>
    <div className={styles.toolbar}><div role="status"><strong>{state.connected ? <Cloud size={17} aria-hidden="true" /> : <CloudOff size={17} aria-hidden="true" />} {state.connected ? "متصل" : "العمل دون اتصال"}{state.syncing ? " · جار المزامنة" : ""}</strong><p className={styles.muted}>{state.assetsStatus}</p></div>
      <button type="button" className={styles.secondary} disabled={state.syncing || !state.ready} onClick={() => void state.retry()}><RefreshCw size={16} aria-hidden="true" />{state.pending.length ? `${state.pending.length} فاتورة بانتظار المزامنة` : "تحديث المزامنة"}</button></div>
    {!!conflicts.length && <details><summary>فواتير محفوظة تحتاج مراجعة</summary>{conflicts.map(sale => <p key={sale.id}><b dir="ltr">{sale.localReference}</b> — {sale.error}</p>)}<p>الفواتير محفوظة على الجهاز ولا يلزم تحصيل المبلغ من العميل مرة أخرى</p></details>}
  </section>;
}
