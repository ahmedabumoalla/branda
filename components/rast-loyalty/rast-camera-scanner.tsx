"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { startRastCameraSession } from "./camera-session";

/** QR decoder also works on browsers without the experimental BarcodeDetector API. */
export function RastCameraScanner({ onDetected, disabled = false }: { onDetected: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const dialogId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onDetected);
  useEffect(() => { callback.current = onDetected; }, [onDetected]);
  useEffect(() => {
    if (!open) return;
    const modal = dialog.current;
    if (!modal) return;
    modal.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  useEffect(() => {
    if (!open || disabled) return;
    const preview = video.current;
    if (!preview) return;
    return startRastCameraSession({ video: preview, onDetected: (value) => { setOpen(false); callback.current(value); }, onError: () => setError("تعذر تشغيل الكاميرا اسمح بالوصول إليها أو استخدم جهاز القارئ وحقل الرمز") });
  }, [open, disabled]);
  return <div>
    <button type="button" disabled={disabled} onClick={() => { setError(""); setOpen(true); }} aria-expanded={open} aria-haspopup="dialog" aria-controls={dialogId} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-current px-5 py-3 font-bold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">
      <Camera size={18} aria-hidden="true" />قراءة بالكاميرا
    </button>
    <dialog ref={dialog} id={dialogId} dir="rtl" aria-labelledby={`${dialogId}-title`} aria-describedby={`${dialogId}-help`} onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={(event) => { if (!event.currentTarget.open) setOpen(false); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto overscroll-contain border-0 bg-[#210E13] p-0 text-white open:flex open:flex-col backdrop:bg-[#210E13]">
      <header className="flex shrink-0 items-center justify-between gap-4 pb-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 id={`${dialogId}-title`} className="text-lg font-bold">قراءة بالكاميرا</h2>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-white/40 px-4 font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <X size={20} aria-hidden="true" />إغلاق الكاميرا
        </button>
      </header>
      <div className="relative min-h-40 flex-1 bg-black">
        <video ref={video} muted playsInline aria-label="معاينة كاميرا قارئ البطاقة" className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <p id={`${dialogId}-help`} role={error ? "alert" : "status"} className="shrink-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm leading-7">{error || (disabled ? "الكاميرا متوقفة مؤقتًا حتى تنتهي العملية" : "وجّه الكاميرا إلى رمز البطاقة أو المكافأة ستظهر القراءة قبل تأكيد العملية")}</p>
    </dialog>
  </div>;
}
