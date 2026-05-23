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
      <div className="space-y-6">
        <div className={`rounded-lg border-2 p-4 ${theme.card}`}>{imageSlot}</div>
        <div className={`rounded-lg border-2 p-6 ${theme.card}`}>{infoSlot}</div>
        <div className={theme.card}>{reviewsSlot}</div>
      </div>
    );
  }

  if (detail === "stack" || detail === "minimal") {
    return (
      <div className="space-y-8">
        <div className={`rounded-3xl p-4 ${theme.card}`}>{imageSlot}</div>
        <div className={`rounded-3xl p-6 md:p-8 ${theme.card}`}>{infoSlot}</div>
        <div>{reviewsSlot}</div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-2">
      <div className={`rounded-[32px] p-4 md:p-5 ${theme.card}`}>{imageSlot}</div>
      <div className={`rounded-[32px] p-6 md:p-8 ${theme.card}`}>{infoSlot}</div>
      <div className="lg:col-span-2">{reviewsSlot}</div>
    </div>
  );
}
