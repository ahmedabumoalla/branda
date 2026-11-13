"use client";

import { useEffect, useState } from "react";
import { getFinanceIssuedOrderSource } from "@/app/actions/finance-order-sources";
import styles from "./finance-invoice-detail.module.css";

export function InvoiceOrderSourceSummary({ slug, documentId }: { slug: string; documentId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; name?: string | null; recorded?: boolean; error?: string } | null>(null);
  const key = `${slug}:${documentId}:${attempt}`;
  useEffect(() => {
    let active = true;
    getFinanceIssuedOrderSource(slug, documentId).then(value => {
      if (active) setResult({ key, ...(value.ok ? value.data : { error: value.message }) });
    }).catch(() => { if (active) setResult({ key, error: "تعذر تحميل مصدر الطلب" }); });
    return () => { active = false; };
  }, [slug, documentId, key, attempt]);
  const current = result?.key === key ? result : null;
  return <section aria-label="مصدر الطلب" className={styles.editor}>
    <strong>مصدر الطلب</strong>
    {!current ? <p role="status">جار تحميل مصدر الطلب</p> : current.error ? <div role="alert"><p>{current.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : <p>{current.recorded ? current.name || "لا شيء" : "غير مسجل لهذه الفاتورة"}</p>}
  </section>;
}
