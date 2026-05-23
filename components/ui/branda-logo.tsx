"use client";

import Image from "next/image";

export type BrandaLogoVariant = "dark" | "brown" | "brown-bg";

const LOGO_PATHS: Record<BrandaLogoVariant, string> = {
  dark: "/brand/branda-logo-dark.png",
  brown: "/brand/branda-logo-brown.png",
  "brown-bg": "/brand/branda-logo-brown-bg.png",
};

type Props = {
  variant?: BrandaLogoVariant;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

export function BrandaLogo({
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
      alt="شعار برندة"
      width={width}
      height={height}
      priority={priority}
      className={`object-contain ${className}`}
    />
  );
}
