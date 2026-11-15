import React from "react";
import { Database, RefreshCw } from "lucide-react";
import styles from "../../components/finance/finance.module.css";
export function FinancePosOfflineStatus({ state }: any) {
  return <button type="button" className={styles.iconButton} title="الحفظ في قاعدة البيانات المحلية" aria-label="تحديث البيانات المحلية" disabled={state.syncing} onClick={() => void state.retry()}>{state.syncing ? <RefreshCw size={20} /> : <Database size={20} />}</button>;
}
