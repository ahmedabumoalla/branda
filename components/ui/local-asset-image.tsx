"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";

type Props = { assetId?: string; fallbackSrc?: string | null; previewUrl?: string; alt: string; className?: string; fallback?: ReactNode; publicBucket?: string };

export function LocalAssetImage({ assetId, fallbackSrc, previewUrl, alt, className = "", fallback = null, publicBucket }: Props) {
  const src = useLocalAssetUrl(assetId, fallbackSrc, previewUrl, publicBucket);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={publicBucket === "menu-products" ? { backgroundColor: "var(--product-image-background, revert-layer)" } : undefined}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
