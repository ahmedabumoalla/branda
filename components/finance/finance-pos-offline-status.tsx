"use client";
import { CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/dashboard/ui/modal";
import type { usePosFinance } from "./use-pos-finance";
import styles from "./finance.module.css";

export function FinancePosOfflineStatus({ state }: { state: ReturnType<typeof usePosFinance>["offline"] }) {
  const [open, setOpen] = useState(false);
  const conflicts = state.pending.filter(sale => sale.status === "conflict");
  const label = `${state.connected ? "متصل" : "العمل دون اتصال"}${state.syncing ? " — جار المزامنة" : ""}${state.pending.length ? ` — ${state.pending.length} فاتورة بانتظار المزامنة` : ""}${conflicts.length ? " — توجد فواتير تحتاج مراجعة" : ""}`;
  return <>
    <button type="button" className={styles.connectionIcon} data-state={state.connected ? "online" : "offline"} data-conflict={conflicts.length > 0 || undefined} title={label} aria-label={`${label} — عرض تفاصيل المزامنة`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {state.connected ? state.syncing ? <CloudUpload size={22} strokeWidth={1.8} aria-hidden="true" /> : <CloudCheck size={22} strokeWidth={1.8} aria-hidden="true" /> : <CloudOff size={22} strokeWidth={1.8} aria-hidden="true" />}
      <span className={styles.connectionDot} aria-hidden="true" />
      {(state.pending.length > 0 || state.syncing) && <span className={styles.connectionCount} aria-hidden="true">{state.syncing ? "↻" : state.pending.length}</span>}
    </button>
    <span className={styles.visuallyHidden} role="status">{label}</span>
    <Modal open={open} title="حالة الحفظ والمزامنة" onClose={() => setOpen(false)}>
    <div className={styles.toolbar}><div><strong>{label}</strong><p className={styles.muted}>{state.assetsStatus}</p></div>
      <button type="button" className={styles.secondary} disabled={state.syncing || !state.ready} onClick={() => void state.retry()}><RefreshCw size={16} aria-hidden="true" />{state.pending.length ? `${state.pending.length} فاتورة بانتظار المزامنة` : "تحديث المزامنة"}</button></div>
    {!!conflicts.length && <details><summary>فواتير محفوظة تحتاج مراجعة</summary>{conflicts.map(sale => <p key={sale.id}><b dir="ltr">{sale.localReference}</b> — {sale.error}</p>)}<p>الفواتير محفوظة على الجهاز ولا يلزم تحصيل المبلغ من العميل مرة أخرى</p></details>}
    </Modal>
  </>;
}
