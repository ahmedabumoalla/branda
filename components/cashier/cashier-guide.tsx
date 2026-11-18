"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PlayCircle, X, ExternalLink } from "lucide-react";
import { cashierGuidePath } from "@/lib/cashier/guide";
import { lockPageScroll } from "@/lib/ui/page-scroll-lock";
import { useCashierLanguage } from "./cashier-language";
import s from "./cashier-guide.module.css";

export function CashierGuideButton() {
  const [open, setOpen] = useState(false);
  const { t } = useCashierLanguage();
  return <>
    <button type="button" className={s.trigger} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <PlayCircle size={18} aria-hidden="true" />{t("شرح استخدام الكاشير")}
    </button>
    {open && <CashierGuideDialog close={() => setOpen(false)} />}
  </>;
}

export function CashierGuideDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const { t, dir } = useCashierLanguage();
  useEffect(() => {
    const node = dialog.current;
    const player = video.current;
    const focused = document.activeElement as HTMLElement | null;
    node?.showModal();
    const release = lockPageScroll();
    return () => {
      player?.pause();
      node?.close();
      release();
      if (focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className={s.dialog} dir={dir} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={s.surface}>
      <header className={s.header}>
        <h2 id={titleId}>{t("شرح استخدام الكاشير")}</h2>
        <button type="button" onClick={close} aria-label={t("إغلاق الشرح")} autoFocus><X size={20} aria-hidden="true" /></button>
      </header>
      <video ref={video} src={cashierGuidePath} controls playsInline preload="none" className={s.video}
        aria-label={t("شرح الدخول وتسجيل الأختام وصرف المكافآت")} onError={() => setFailed(true)} />
      {failed && <p role="alert" className={s.error}>{t("تعذر تشغيل الفيديو افتحه من الرابط أدناه")}</p>}
      <a className={s.external} href={cashierGuidePath} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} aria-hidden="true" />{t("فتح الفيديو في نافذة مستقلة")}
      </a>
    </div>
  </dialog>;
}
