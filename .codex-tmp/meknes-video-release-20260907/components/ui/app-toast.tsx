"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

export type AppToastState = {
  type: "success" | "error" | "loading";
  message: string;
  action?: { label: string; href: string };
};

type Props = {
  toast: AppToastState | null;
};

export function AppToast({ toast }: Props) {
  if (!toast) return null;

  const styles: Record<AppToastState["type"], string> = {
    success:
      "border-[#D9A33F]/40 bg-[#311912] text-[#FCF8F3] shadow-[0_12px_40px_rgba(49,25,18,0.25)]",
    error: "border-red-300 bg-red-50 text-red-800",
    loading: "border-[#E7D7C6] bg-[#FCF8F3] text-[#311912]",
  };

  const icons: Record<AppToastState["type"], ReactNode> = {
    success: <CheckCircle2 className="h-5 w-5 shrink-0 text-[#D9A33F]" />,
    error: <XCircle className="h-5 w-5 shrink-0 text-red-600" />,
    loading: <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#6B3A25]" />,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 z-[100] flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-5 py-3.5 text-sm font-black shadow-xl ${styles[toast.type]}`}
    >
      {icons[toast.type]}
      <span className="flex-1 text-right">{toast.message}</span>
      {toast.action ? (
        <Link
          href={toast.action.href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-xl bg-[#D9A33F] px-3 py-1.5 text-xs font-black text-[#311912] hover:bg-[#F0C568]"
        >
          {toast.action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function useAppToast(autoHideMs = 3500) {
  const [toast, setToast] = useState<AppToastState | null>(null);

  function showToast(next: AppToastState) {
    setToast(next);
    if (next.type !== "loading") {
      window.setTimeout(() => setToast(null), autoHideMs);
    }
  }

  function clearToast() {
    setToast(null);
  }

  return { toast, showToast, clearToast, setToast };
}
