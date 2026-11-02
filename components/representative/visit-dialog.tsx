"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { lockPageScroll } from "@/lib/ui/page-scroll-lock";
import styles from "./admin-visits.module.css";

export function VisitDialog({ title, label, primary = false, children }: { title: string; label: string; primary?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const release = useRef<(() => void) | null>(null);
  const titleId = useId();
  useEffect(() => () => { release.current?.(); }, []);
  function close() {
    if (dialog.current?.querySelector('form[aria-busy="true"]')) return;
    dialog.current?.close();
  }
  return <>
    <button ref={trigger} type="button" className={primary ? styles.primary : styles.detailButton} aria-haspopup="dialog" onClick={() => {
      dialog.current?.showModal();
      if (!release.current) release.current = lockPageScroll();
    }}>{primary && <Plus size={18} aria-hidden="true" />}{label}</button>
    <dialog ref={dialog} className={styles.dialog} dir="rtl" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => { release.current?.(); release.current = null; trigger.current?.focus({ preventScroll: true }); }}>
      <header className={styles.dialogHeader}><div><small>الزيارات الميدانية</small><h2 id={titleId}>{title}</h2></div>
        <button type="button" onClick={close} aria-label="إغلاق النافذة" autoFocus><X size={20} aria-hidden="true" /></button>
      </header>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  </>;
}
