"use client";

import { Coffee } from "lucide-react";

type Props = {
  name: string;
  logoUrl?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeMap = {
  sm: { box: "h-12 w-12", text: "text-lg", icon: "h-5 w-5", pad: "p-1" },
  md: { box: "h-16 w-16", text: "text-2xl", icon: "h-7 w-7", pad: "p-1.5" },
  lg: { box: "h-24 w-24", text: "text-3xl", icon: "h-10 w-10", pad: "p-2" },
  xl: { box: "h-32 w-32", text: "text-4xl", icon: "h-12 w-12", pad: "p-3" },
};

export function CafeLogo({ name, logoUrl, size = "md", className = "" }: Props) {
  const s = sizeMap[size];
  const initial = name.trim().charAt(0) || "ك";

  if (logoUrl) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F8F4EF] shadow-[6px_8px_24px_rgba(58,33,23,0.1)] ${s.box} ${className}`}
      >
        <img src={logoUrl} alt={name} className={`h-full w-full object-contain ${s.pad}`} />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3A2117] to-[#6B3A25] font-black text-[#F6C35B] shadow-[6px_8px_24px_rgba(58,33,23,0.15)] ${s.box} ${className}`}
      aria-hidden
    >
      {initial.length === 1 && /[\u0600-\u06FFa-zA-Z0-9]/.test(initial) ? (
        <span className={s.text}>{initial}</span>
      ) : (
        <Coffee className={s.icon} />
      )}
    </div>
  );
}
