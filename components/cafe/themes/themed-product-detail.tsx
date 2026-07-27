"use client";

import type { ReactNode } from "react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  experience: ThemeExperience;
  imageSlot: ReactNode;
  infoSlot: ReactNode;
};

export function ThemedProductDetailLayout({
  experience,
  imageSlot,
  infoSlot,
}: Props) {
  const { theme, detail } = experience;

  if (detail === "kiosk") {
    return (
      <div className="min-w-0 space-y-5">
        <div className={`barndaksa-premium-card min-w-0 rounded-2xl border-2 p-2 shadow-[0_18px_55px_rgba(49,25,18,0.08)] sm:p-3 ${theme.card}`}>{imageSlot}</div>
        <div className={`barndaksa-premium-card min-w-0 rounded-2xl border-2 p-5 shadow-[0_18px_55px_rgba(49,25,18,0.08)] sm:p-6 ${theme.card}`}>{infoSlot}</div>
      </div>
    );
  }

  if (detail === "stack" || detail === "minimal") {
    return (
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <div className={`barndaksa-premium-card min-w-0 overflow-hidden rounded-[28px] border border-black/5 p-2 shadow-[0_22px_70px_rgba(49,25,18,0.10)] sm:rounded-[34px] sm:p-3 ${theme.card}`}>{imageSlot}</div>
        <div className={`barndaksa-premium-card min-w-0 rounded-[28px] border border-black/5 p-5 shadow-[0_22px_70px_rgba(49,25,18,0.10)] sm:rounded-[34px] sm:p-6 md:p-8 ${theme.card}`}>{infoSlot}</div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-8">
      <div className={`barndaksa-premium-card min-w-0 overflow-hidden rounded-[28px] border border-black/5 p-2 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:rounded-[36px] sm:p-3 md:p-4 lg:sticky lg:top-24 ${theme.card}`}>
        {imageSlot}
      </div>
      <div className={`barndaksa-premium-card min-w-0 rounded-[28px] border border-black/5 p-5 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:rounded-[36px] sm:p-6 md:p-8 ${theme.card}`}>
        {infoSlot}
      </div>
    </div>
  );
}
