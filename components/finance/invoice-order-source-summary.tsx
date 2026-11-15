"use client";

import { useEffect, useState } from "react";
import type { InvoiceDetailLoader } from "@/lib/finance/invoice-detail-loader";
import styles from "./finance-invoice-detail.module.css";

export function InvoiceOrderSourceSummary({ reader }: { reader: InvoiceDetailLoader["orderSource"] }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ reader: typeof reader; attempt: number; name?: string | null; recorded?: boolean; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (reader.peek()) return;
    reader.load().then(value => {
      if (active) setResult({ reader, attempt, ...(value.ok ? value.data : { error: value.message }) });
    }).catch(() => { if (active) setResult({ reader, attempt, error: "تعذر تحميل مصدر الطلب" }); });
    return () => { active = false; };
  }, [reader, attempt]);
  const cached = reader.peek();
  const current = cached?.ok ? { ...cached.data, error: undefined } : result?.reader === reader && result.attempt === attempt ? result : null;
  return <section aria-label="مصدر الطلب" className={styles.editor}>
    <strong>مصدر الطلب</strong>
    {!current ? <p role="status">جار تحميل مصدر الطلب</p> : current.error ? <div role="alert"><p>{current.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>إعادة المحاولة</button></div> : <p>{current.recorded ? current.name || "لا شيء" : "غير مسجل لهذه الفاتورة"}</p>}
  </section>;
}
