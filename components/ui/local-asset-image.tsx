"use client";

import type { ReactNode } from "react";
import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";

type Props = { assetId?: string; fallbackSrc?: string | null; previewUrl?: string; alt: string; className?: string; fallback?: ReactNode; publicBucket?: string };

export function LocalAssetImage({ assetId, fallbackSrc, previewUrl, alt, className = "", fallback = null, publicBucket }: Props) {
  const src = useLocalAssetUrl(assetId, fallbackSrc, previewUrl, publicBucket);
  if (!src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} loading="lazy" decoding="async" />;
}
