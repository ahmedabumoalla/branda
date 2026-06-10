"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Coffee } from "lucide-react";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { MenuProduct, MenuProductImage } from "@/lib/mock/menu";
import { isHttpImageUrl } from "@/lib/cafe/image-asset-pipeline";

type ProductImageSource = Pick<MenuProduct, "imageAssetId" | "imageDataUrl" | "imageGallery">;

type Props = {
  product: ProductImageSource;
  alt: string;
  className?: string;
  previewUrl?: string;
  fallback?: ReactNode;
};

function externalUrl(src?: string | null) {
  if (!src) return undefined;
  if (isHttpImageUrl(src)) return src;
  if (src.startsWith("data:image")) return src;
  return undefined;
}

export function getProductImageSources(product: ProductImageSource): MenuProductImage[] {
  const gallery = Array.isArray(product.imageGallery) ? product.imageGallery : [];
  const normalized = gallery
    .filter((item) => item?.imageAssetId || item?.imageDataUrl)
    .map((item) => ({
      imageAssetId: item.imageAssetId,
      imageDataUrl: item.imageDataUrl ?? null,
      alt: item.alt,
    }));

  const main = product.imageAssetId || product.imageDataUrl
    ? [{ imageAssetId: product.imageAssetId, imageDataUrl: product.imageDataUrl ?? null }]
    : [];

  const merged = [...main, ...normalized];
  const seen = new Set<string>();

  return merged.filter((item) => {
    const key = item.imageAssetId || item.imageDataUrl || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ProductImage({ product, alt, className = "", previewUrl, fallback = null }: Props) {
  const first = getProductImageSources(product)[0] ?? {
    imageAssetId: product.imageAssetId,
    imageDataUrl: product.imageDataUrl,
  };

  return (
    <LocalAssetImage
      assetId={first.imageAssetId}
      fallbackSrc={externalUrl(first.imageDataUrl)}
      previewUrl={previewUrl}
      alt={alt}
      className={className}
      fallback={fallback}
      publicBucket="menu-products"
    />
  );
}

type CarouselProps = {
  product: ProductImageSource;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  intervalMs?: number;
};

export function ProductMediaCarousel({
  product,
  alt,
  className = "",
  fallback,
  intervalMs = 5000,
}: CarouselProps) {
  const sources = useMemo(() => getProductImageSources(product), [product]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [sources.length]);

  useEffect(() => {
    if (sources.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % sources.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [sources.length, intervalMs]);

  if (!sources.length) {
    return (
      <>
        {fallback ?? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#3A2117] to-[#9B6A34]">
            <Coffee className="h-12 w-12 text-white/85" />
          </div>
        )}
      </>
    );
  }

  const current = sources[index] ?? sources[0];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <LocalAssetImage
        assetId={current.imageAssetId}
        fallbackSrc={externalUrl(current.imageDataUrl)}
        alt={current.alt || alt}
        className={className}
        fallback={fallback}
        publicBucket="menu-products"
      />

      {sources.length > 1 ? (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur">
          {sources.map((_, itemIndex) => (
            <span
              key={itemIndex}
              className={`h-1.5 rounded-full bg-white transition-all ${
                itemIndex === index ? "w-5 opacity-100" : "w-1.5 opacity-50"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
