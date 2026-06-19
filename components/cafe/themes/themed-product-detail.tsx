"use client";

import type { ReactNode } from "react";
import type { ThemeExperience } from "@/lib/cafe/theme-experience";

type Props = {
  experience: ThemeExperience;
  imageSlot: ReactNode;
  infoSlot: ReactNode;
  reviewsSlot: ReactNode;
};

export function ThemedProductDetailLayout({
  experience,
  imageSlot,
  infoSlot,
  reviewsSlot,
}: Props) {
  const { theme, detail } = experience;

  if (detail === "kiosk") {
    return (
      <div className="space-y-5">
        <div className={`barndaksa-premium-card rounded-2xl border-2 p-3 shadow-[0_18px_55px_rgba(49,25,18,0.08)] ${theme.card}`}>{imageSlot}</div>
        <div className={`barndaksa-premium-card rounded-2xl border-2 p-5 shadow-[0_18px_55px_rgba(49,25,18,0.08)] ${theme.card}`}>{infoSlot}</div>
        <div className={`rounded-[28px] ${theme.card}`}>{reviewsSlot}</div>
      </div>
    );
  }

  if (detail === "stack" || detail === "minimal") {
    return (
      <div className="space-y-6">
        <div className={`barndaksa-premium-card overflow-hidden rounded-[34px] border border-black/5 p-3 shadow-[0_22px_70px_rgba(49,25,18,0.10)] ${theme.card}`}>{imageSlot}</div>
        <div className={`barndaksa-premium-card rounded-[34px] border border-black/5 p-5 shadow-[0_22px_70px_rgba(49,25,18,0.10)] sm:p-6 md:p-8 ${theme.card}`}>{infoSlot}</div>
        <div>{reviewsSlot}</div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:gap-8">
      <div className={`barndaksa-premium-card overflow-hidden rounded-[36px] border border-black/5 p-3 shadow-[0_24px_80px_rgba(49,25,18,0.12)] md:p-4 lg:sticky lg:top-24 ${theme.card}`}>
        {imageSlot}
      </div>
      <div className={`barndaksa-premium-card rounded-[36px] border border-black/5 p-5 shadow-[0_24px_80px_rgba(49,25,18,0.12)] sm:p-6 md:p-8 ${theme.card}`}>
        {infoSlot}
      </div>
      <div className="lg:col-span-2">{reviewsSlot}</div>
    </div>
  );
}
