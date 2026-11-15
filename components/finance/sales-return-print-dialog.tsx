"use client";

import { useEffect, useState } from "react";
import { readSalesReturnPrintAction } from "@/app/actions/finance-sales-returns";
import { Modal } from "@/components/dashboard/ui/modal";
import styles from "./finance.module.css";
import css from "./finance-credit-notes.module.css";

export function SalesReturnPrintDialog({ id, slug, onClose }: { id: string; slug: string; onClose: () => void }) {
  const [result, setResult] = useState<{ key: string; url?: string; error?: string; tax?: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${slug}:${id}:${revision}`;
  const current = result?.key === key ? result : null;
  useEffect(() => {
    let active = true, url = "";
    void (async () => {
      try {
        const response = await readSalesReturnPrintAction(id, slug);
        if (!response.ok) throw new Error(response.message);
        if (!active) return;
        const { createCompanyInvoicePreviewPdf } = await import("@/lib/export/company-invoice-preview-pdf");
        const blob = await createCompanyInvoicePreviewPdf(response.data);
        if (!active) return;
        url = URL.createObjectURL(blob);
        setResult({ key, url, tax: !!response.data.salesReturn?.fiscal });
      } catch (cause) { if (active) setResult({ key, error: cause instanceof Error ? cause.message : "تعذر إعداد مستند المرتجع" }); }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [id, slug, key]);
  return <Modal open title="طباعة مستند المرتجع" onClose={onClose} footer={current?.url ? <a className={styles.primary} href={current.url} target="_blank" rel="noopener noreferrer">فتح المستند للطباعة أو الحفظ</a> : undefined}>
    <div className={`${css.page} ${css.previewBody}`}>
      {!current && <p role="status">جار إعداد مستند المرتجع</p>}
      {current?.error && <div role="alert"><p className={styles.error}>{current.error}</p><button type="button" className={styles.secondary} onClick={() => setRevision(value => value + 1)}>إعادة المحاولة</button></div>}
      {current?.url && <>{!current.tax && <p className={styles.notice}>المستند المحفوظ لا يحتوي على بيانات ضريبية مكتملة للبائع لذلك تُطبع نسخة مرتجع عادية</p>}<iframe title={current.tax ? "إشعار دائن ضريبي للمرتجع" : "مستند المرتجع للطباعة"} src={current.url} className={css.pdf} /></>}
    </div>
  </Modal>;
}
