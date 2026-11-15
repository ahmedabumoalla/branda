import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import styles from "./invoice-load-status.module.css";

export type InvoiceLoadResource = {
  key: string;
  label: string;
  loading: boolean;
  error?: string;
  retry: () => void;
  retryDisabled?: boolean;
};

/** Keep every failed read actionable without stacking a banner for every pending read. */
export function InvoiceLoadStatus({ resources }: { resources: InvoiceLoadResource[] }) {
  const pending = resources.filter(resource => resource.loading);
  const failed = resources.filter(resource => !resource.loading && resource.error);
  if (!pending.length && !failed.length) return null;

  return <div className={styles.panel}>
    {!!pending.length && <div className={styles.progress} role="status" aria-live="polite">
      <LoaderCircle className={styles.spinner} size={20} aria-hidden="true" />
      <div><strong>جار تجهيز الفاتورة</strong><span>{pending.map(resource => resource.label).join(" · ")}</span></div>
    </div>}
    {failed.map(resource => <div className={styles.failure} key={resource.key}>
      <AlertCircle size={18} aria-hidden="true" />
      <div role="alert"><strong>{resource.label}</strong><span>{resource.error}</span></div>
      <button type="button" disabled={resource.retryDisabled} onClick={resource.retry} aria-label={`إعادة تحميل ${resource.label}`}>
        <RotateCcw size={15} aria-hidden="true" />إعادة المحاولة
      </button>
    </div>)}
  </div>;
}
