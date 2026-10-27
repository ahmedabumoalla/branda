"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Maximize, Minimize } from "lucide-react";
import styles from "./finance-pos-actions.module.css";

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void | Promise<void> };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void | Promise<void> };

export function isPosFullscreen(doc: FullscreenDocument = document) {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

export async function togglePosFullscreen(doc: FullscreenDocument = document) {
  if (isPosFullscreen(doc)) {
    if (doc.fullscreenElement && doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
    else throw new Error("Fullscreen exit unavailable");
  } else {
    // Include body portals so dialogs and receipts stay visible in fullscreen.
    const element = doc.documentElement as FullscreenElement;
    if (element.requestFullscreen) await element.requestFullscreen();
    else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
    else throw new Error("Fullscreen unavailable");
  }
}

function subscribe(listener: () => void) {
  document.addEventListener("fullscreenchange", listener);
  document.addEventListener("webkitfullscreenchange", listener);
  return () => {
    document.removeEventListener("fullscreenchange", listener);
    document.removeEventListener("webkitfullscreenchange", listener);
  };
}
const serverSnapshot = () => false;

export function FinancePosFullscreen() {
  const active = useSyncExternalStore(subscribe, isPosFullscreen, serverSnapshot);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const label = active ? "الخروج من ملء الشاشة" : "ملء الشاشة";
  useEffect(() => {
    const failed = () => setError("تعذر تفعيل ملء الشاشة تأكد من دعم المتصفح والسماح بهذه الميزة");
    document.addEventListener("fullscreenerror", failed);
    document.addEventListener("webkitfullscreenerror", failed);
    return () => {
      document.removeEventListener("fullscreenerror", failed);
      document.removeEventListener("webkitfullscreenerror", failed);
    };
  }, []);
  return <div className={styles.fullscreen}>
    <button type="button" className={styles.fullscreenButton} title={label} aria-label={label} aria-pressed={active} disabled={pending} onClick={async () => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      setError("");
      try { await togglePosFullscreen(); }
      catch { setError("تعذر تغيير وضع الشاشة افتح الصفحة مباشرة في متصفح يدعم ملء الشاشة"); }
      finally { busy.current = false; setPending(false); }
    }}>{active ? <Minimize size={19} aria-hidden="true" /> : <Maximize size={19} aria-hidden="true" />}</button>
    {error && <div className={styles.fullscreenError} role="alert">{error}</div>}
  </div>;
}
