"use client";
import { useFinancePosLocale } from "./finance-pos-locale";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { startInventoryCameraSession } from "./inventory-camera-session";
import styles from "./finance-inventory-item-form.module.css";

export function FinanceInventoryBarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const { t } = useFinancePosLocale();
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onDetected);
  const [error, setError] = useState(false);
  useEffect(() => { callback.current = onDetected; }, [onDetected]);
  useEffect(() => {
    if (!video.current) return;
    return startInventoryCameraSession({ video: video.current, onDetected: value => callback.current(value), onError: () => setError(true) });
  }, []);
  return <section className={styles.camera} aria-label={t("قراءة باركود الصنف بالكاميرا")}>
    <header><strong>{t("وجّه الكاميرا نحو الباركود")}</strong><button type="button" onClick={onClose} aria-label={t("إغلاق الكاميرا")}><X size={18} /></button></header>
    {error ? <p role="alert">{t("تعذر تشغيل الكاميرا تحقق من الإذن أو أدخل الباركود يدويًا أو استخدم القارئ")}</p> : <><video ref={video} autoPlay muted playsInline /><p role="status">{t("تتم القراءة تلقائيًا عند وضوح الرمز")}</p></>}
  </section>;
}
