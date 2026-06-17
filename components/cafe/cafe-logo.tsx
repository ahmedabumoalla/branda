"use client";

import { DEFAULT_BARNDAKSA_CAFE_LOGO } from "@/lib/cafe/cafe-display-logo";

type Props = {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeMap = {
  sm: { box: "h-12 w-12", pad: "p-1" },
  md: { box: "h-16 w-16", pad: "p-1.5" },
  lg: { box: "h-24 w-24", pad: "p-2" },
  xl: { box: "h-32 w-32", pad: "p-3" },
};

function normalizeLogoUrl(value?: string | null) {
  if (typeof value !== "string") return DEFAULT_BARNDAKSA_CAFE_LOGO;
  const next = value.trim();
  if (!next || next.startsWith("data:")) return DEFAULT_BARNDAKSA_CAFE_LOGO;
  if (next.startsWith("/") || next.startsWith("blob:") || /^https?:\/\//i.test(next)) return next;
  return DEFAULT_BARNDAKSA_CAFE_LOGO;
}

export function CafeLogo({ name, logoUrl, size = "md", className = "" }: Props) {
  const s = sizeMap[size];
  const src = normalizeLogoUrl(logoUrl);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F8F4EF] shadow-[6px_8px_24px_rgba(58,33,23,0.1)] ${s.box} ${className}`}
    >
      <img
        src={src}
        alt={name || "برندة"}
        className={`h-full w-full object-contain ${s.pad}`}
        onError={(event) => {
          if (event.currentTarget.src !== DEFAULT_BARNDAKSA_CAFE_LOGO) {
            event.currentTarget.src = DEFAULT_BARNDAKSA_CAFE_LOGO;
          }
        }}
      />
    </div>
  );
}
