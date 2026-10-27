"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { startInventoryCameraSession } from "./inventory-camera-session";
import styles from "./finance-inventory-item-form.module.css";

export function FinanceInventoryBarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onDetected);
  const [error, setError] = useState(false);
  useEffect(() => { callback.current = onDetected; }, [onDetected]);
  useEffect(() => {
    if (!video.current) return;
    return startInventoryCameraSession({ video: video.current, onDetected: value => callback.current(value), onError: () => setError(true) });
  }, []);
  return <section className={styles.camera} aria-label="قراءة باركود الصنف بالكاميرا">
    <header><strong>وجّه الكاميرا نحو الباركود</strong><button type="button" onClick={onClose} aria-label="إغلاق الكاميرا"><X size={18} /></button></header>
    {error ? <p role="alert">تعذر تشغيل الكاميرا تحقق من الإذن أو أدخل الباركود يدويًا أو استخدم القارئ</p> : <><video ref={video} autoPlay muted playsInline /><p role="status">تتم القراءة تلقائيًا عند وضوح الرمز</p></>}
  </section>;
}
