"use client";

import Image from "next/image";

export type BarndaksaLogoVariant = "dark" | "brown" | "brown-bg";

const LOGO_PATHS: Record<BarndaksaLogoVariant, string> = {
  dark: "/brand/barndaksa-logo-dark.png",
  brown: "/brand/barndaksa-logo-brown.png",
  "brown-bg": "/brand/barndaksa-logo-brown-bg.png",
};

type Props = {
  variant?: BarndaksaLogoVariant;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

export function BarndaksaLogo({
  variant = "brown",
  className = "",
  width = 180,
  height = 72,
  priority = false,
}: Props) {
  const src = LOGO_PATHS[variant];

  return (
    <Image
      src={src}
      alt="شعار بارنداكسا"
      width={width}
      height={height}
      priority={priority}
      className={`h-auto w-auto max-w-full object-contain ${className}`}
      style={{ width, height: "auto" }}
    />
  );
}
