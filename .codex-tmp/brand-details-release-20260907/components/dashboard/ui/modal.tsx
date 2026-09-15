"use client";

import { X } from "lucide-react";

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
  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <div
        className={
          panelClassName ||
          "flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        }
      >
        <div className="shrink-0 flex items-center justify-between border-b border-[#EFE8DF] px-6 py-5">
          <h2 className="text-2xl font-black text-[#3A2117]">{title}</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-[#F8F4EF] p-3 text-[#3A2117]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
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