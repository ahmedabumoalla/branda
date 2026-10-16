"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { lockPageScroll } from "@/lib/ui/page-scroll-lock";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  panelClassName,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockPageScroll();
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      unlock();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); onClose(); }
          if (event.key !== "Tab") return;
          const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])
            .filter((item) => item.getClientRects().length && !item.closest("[inert]"));
          const first = items[0];
          const last = items.at(-1);
          if (!first) { event.preventDefault(); return; }
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
            event.preventDefault(); last?.focus({ preventScroll: true });
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
            event.preventDefault(); first.focus({ preventScroll: true });
          }
        }}
        className={
          panelClassName ||
          "flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        }
      >
        <div className="shrink-0 flex items-center justify-between border-b border-[#EFE8DF] px-6 py-5">
          <h2 id={titleId} className="text-2xl font-black text-[#3A2117]">{title}</h2>

          <button
            type="button"
            aria-label="إغلاق"
            onClick={onClose}
            className="rounded-2xl bg-[#F8F4EF] p-3 text-[#3A2117]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 flex items-center justify-end gap-3 border-t border-[#EFE8DF] bg-white px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
