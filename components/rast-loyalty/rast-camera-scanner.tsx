"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { startRastCameraSession } from "./camera-session";

/** QR decoder also works on browsers without the experimental BarcodeDetector API. */
export function RastCameraScanner({ onDetected, disabled = false }: { onDetected: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onDetected);
  useEffect(() => { callback.current = onDetected; }, [onDetected]);
  useEffect(() => {
    if (!open || disabled) return;
    const preview = video.current;
    if (!preview) return;
    return startRastCameraSession({ video: preview, onDetected: (value) => { setOpen(false); callback.current(value); }, onError: () => setError("تعذر تشغيل الكاميرا. اسمح بالوصول إليها، أو استخدم جهاز القارئ وحقل الرمز.") });
  }, [open, disabled]);
  return <div>
    <button type="button" disabled={disabled && !open} onClick={() => { setError(""); setOpen((value) => !value); }} aria-expanded={open} aria-controls="rast-camera" className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-current px-5 py-3 font-bold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">
      {open ? <X size={18} aria-hidden="true" /> : <Camera size={18} aria-hidden="true" />}{open ? "إغلاق الكاميرا" : "قراءة بالكاميرا"}
    </button>
    {open && <div id="rast-camera" className="mt-4 overflow-hidden rounded-2xl bg-[#210E13] p-3 text-white">
      <video ref={video} muted playsInline aria-label="معاينة كاميرا قارئ البطاقة" className="aspect-video w-full rounded-xl object-cover" />
      <p role={error ? "alert" : "status"} className="p-3 text-sm leading-7">{error || (disabled ? "الكاميرا متوقفة مؤقتًا حتى تنتهي العملية." : "وجّه الكاميرا إلى رمز البطاقة أو المكافأة. ستظهر القراءة قبل تأكيد العملية.")}</p>
    </div>}
  </div>;
}
