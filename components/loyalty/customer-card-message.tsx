"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { loadLoyaltyCustomerCardMessageAction } from "@/app/actions/loyalty-customer-card-message";
import styles from "./customer-card-message.module.css";

/** Builds the customer's card link message on request, so the brand can send it by hand from its own phone */
export function CustomerCardMessage({ customerId, downloadedOnly = false }: { customerId: string; downloadedOnly?: boolean }) {
  const [ready, setReady] = useState<{ message: string; whatsappUrl: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function prepare() {
    setLoading(true);
    setError("");
    try {
      const result = await loadLoyaltyCustomerCardMessageAction(customerId, downloadedOnly);
      if (result.ok) setReady(result.data);
      else setError(result.message);
    } catch {
      setError("تعذر تجهيز رسالة البطاقة أعد المحاولة");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(ready.message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("تعذر النسخ حدد النص وانسخه يدويًا");
    }
  }

  return (
    <section className={styles.block} aria-label="رسالة بطاقة العميل">
      <div className={styles.head}>
        <strong>رسالة البطاقة</strong>
        <span>أرسلها للعميل من جوالك</span>
      </div>
      {ready ? (
        <>
          <textarea className={styles.text} readOnly rows={8} dir="rtl" value={ready.message} aria-label="نص رسالة البطاقة" onFocus={(event) => event.currentTarget.select()} />
          <div className={styles.actions}>
            <button type="button" onClick={copy}>
              {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
              {copied ? "تم النسخ" : "نسخ الرسالة"}
            </button>
            <a href={ready.whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={17} aria-hidden="true" />
              فتح واتساب
            </a>
          </div>
          <p className={styles.hint}>الرابط خاص بهذا العميل وصالح 30 يومًا</p>
        </>
      ) : (
        <button type="button" className={styles.prepare} onClick={prepare} disabled={loading}>
          {loading ? "جار تجهيز الرسالة" : "تجهيز رسالة البطاقة"}
        </button>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
