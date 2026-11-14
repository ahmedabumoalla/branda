"use client";
import { useFinancePosLocale } from "./finance-pos-locale";

import { CloudCheck, CloudOff, CloudUpload, RefreshCw } from "lucide-react";
import { useState } from "react";
import { FinancePosModal as Modal } from "./finance-pos-locale";
import type { usePosFinance } from "./use-pos-finance";
import styles from "./finance.module.css";

export function FinancePosOfflineStatus({ state }: { state: ReturnType<typeof usePosFinance>["offline"] }) {
  const { t } = useFinancePosLocale();
  const [open, setOpen] = useState(false);
  const conflicts = state.pending.filter(sale => sale.status === "conflict");
  const label = `${state.connected ? t("متصل") : t("العمل دون اتصال")}${state.syncing ? t(" — جار المزامنة") : ""}${state.pending.length ? ` — ${state.pending.length}${t(" فاتورة بانتظار المزامنة")}` : ""}${conflicts.length ? t(" — توجد فواتير تحتاج مراجعة") : ""}`;
  return <>
    <button type="button" className={styles.connectionIcon} data-state={state.connected ? "online" : "offline"} data-conflict={conflicts.length > 0 || undefined} title={label} aria-label={`${label}${t(" — عرض تفاصيل المزامنة")}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      {state.connected ? state.syncing ? <CloudUpload size={22} strokeWidth={1.8} aria-hidden="true" /> : <CloudCheck size={22} strokeWidth={1.8} aria-hidden="true" /> : <CloudOff size={22} strokeWidth={1.8} aria-hidden="true" />}
      <span className={styles.connectionDot} aria-hidden="true" />
      {(state.pending.length > 0 || state.syncing) && <span className={styles.connectionCount} aria-hidden="true">{state.syncing ? "↻" : state.pending.length}</span>}
    </button>
    <span className={styles.visuallyHidden} role="status">{label}</span>
    <Modal open={open} title={t("حالة الحفظ والمزامنة")} onClose={() => setOpen(false)}>
    <div className={styles.toolbar}><div><strong>{label}</strong><p className={styles.muted}>{t(state.assetsStatus)}</p></div>
      <button type="button" className={styles.secondary} disabled={state.syncing || !state.ready} onClick={() => void state.retry()}><RefreshCw size={16} aria-hidden="true" />{state.pending.length ? `${state.pending.length}${t(" فاتورة بانتظار المزامنة")}` : t("تحديث المزامنة")}</button></div>
    {!!conflicts.length && <details><summary>{t("فواتير محفوظة تحتاج مراجعة")}</summary>{conflicts.map(sale => <p key={sale.id}><b dir="ltr">{sale.localReference}</b> — {t(sale.error || "")}</p>)}<p>{t("الفواتير محفوظة على الجهاز ولا يلزم تحصيل المبلغ من العميل مرة أخرى")}</p></details>}
    </Modal>
  </>;
}
