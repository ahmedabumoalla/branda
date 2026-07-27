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
      <div className={`barndaksa-premium-card grid min-w-0 gap-5 overflow-hidden rounded-2xl border border-black/5 p-3 shadow-[0_18px_55px_rgba(49,25,18,0.08)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-center md:p-5 ${theme.card}`}>
        <div className="min-w-0">{imageSlot}</div>
        <div className="min-w-0 p-2 sm:p-4">{infoSlot}</div>
      </div>
    );
  }

  if (detail === "stack" || detail === "minimal") {
    return (
      <div className={`barndaksa-premium-card grid min-w-0 gap-5 overflow-hidden rounded-2xl border border-black/5 p-3 shadow-[0_18px_55px_rgba(49,25,18,0.08)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:p-5 ${theme.card}`}>
        <div className="min-w-0">{imageSlot}</div>
        <div className="min-w-0 p-2 sm:p-4">{infoSlot}</div>
      </div>
    );
  }

  return (
    <div className={`barndaksa-premium-card grid min-w-0 gap-5 overflow-hidden rounded-2xl border border-black/5 p-3 shadow-[0_18px_55px_rgba(49,25,18,0.08)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-7 lg:p-5 ${theme.card}`}>
      <div className="min-w-0">{imageSlot}</div>
      <div className="min-w-0 p-2 sm:p-4">{infoSlot}</div>
    </div>
  );
}
