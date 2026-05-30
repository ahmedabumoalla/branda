"use client";

import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";

type Props = {
  assetId?: string;
  fallbackSrc?: string | null;
  previewUrl?: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
};

export function LocalAssetImage({
  assetId,
  fallbackSrc,
  previewUrl,
  alt,
  className = "",
  fallback = null,
}: Props) {
  const src = useLocalAssetUrl(assetId, fallbackSrc, previewUrl);

  if (!src) return <>{fallback}</>;

  return <img src={src} alt={alt} className={className} />;
}
