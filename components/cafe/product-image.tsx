"use client";

import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { MenuProduct } from "@/lib/mock/menu";
import { isHttpImageUrl } from "@/lib/cafe/image-asset-pipeline";

type Props = {
  product: Pick<MenuProduct, "imageAssetId" | "imageDataUrl">;
  alt: string;
  className?: string;
  previewUrl?: string;
  fallback?: React.ReactNode;
};

export function ProductImage({
  product,
  alt,
  className = "",
  previewUrl,
  fallback = null,
}: Props) {
  const externalUrl = isHttpImageUrl(product.imageDataUrl)
    ? product.imageDataUrl ?? undefined
    : product.imageDataUrl?.startsWith("data:image")
      ? product.imageDataUrl
      : undefined;

  return (
    <LocalAssetImage
      assetId={product.imageAssetId}
      fallbackSrc={externalUrl}
      previewUrl={previewUrl}
      alt={alt}
      className={className}
      fallback={fallback}
    />
  );
}
