"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Coffee } from "lucide-react";
import { LocalAssetImage } from "@/components/ui/local-asset-image";
import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";
import type { MenuProduct, MenuProductImage } from "@/lib/mock/menu";
import { isHttpImageUrl } from "@/lib/cafe/image-asset-pipeline";

type ProductImageSource = Pick<MenuProduct, "imageAssetId" | "imageDataUrl" | "imageGallery">;
type ProductMediaSource = Pick<
  MenuProduct,
  "imageAssetId" | "imageDataUrl" | "imageGallery" | "videoAssetId" | "media"
>;

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
  if (src.startsWith("blob:")) return src;
  return undefined;
}

function mediaUrl(src?: string | null) {
  if (!src) return undefined;
  if (isHttpImageUrl(src) || src.startsWith("blob:")) return src;
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

export function getProductVideoSource(product: ProductMediaSource) {
  const media = Array.isArray(product.media) ? product.media : [];
  const video = media.find((item) => item.type === "video" && (item.assetId || item.url));

  if (video) {
    return {
      assetId: video.assetId,
      url: video.url ?? null,
      mimeType: video.mimeType,
    };
  }

  return product.videoAssetId
    ? { assetId: product.videoAssetId, url: null, mimeType: undefined }
    : null;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [sources.length]);

  useEffect(() => {
    if (sources.length <= 1) {
      setIsVisible(false);
      return;
    }

    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { threshold: 0.2 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [sources.length]);

  useEffect(() => {
    if (sources.length <= 1 || !isVisible) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % sources.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [sources.length, intervalMs, isVisible]);

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
    <div ref={rootRef} className="relative h-full w-full overflow-hidden">
      <LocalAssetImage
        key={current.imageAssetId || current.imageDataUrl || index}
        assetId={current.imageAssetId}
        fallbackSrc={externalUrl(current.imageDataUrl)}
        alt={current.alt || alt}
        className={`${className} barndaksa-product-media-fade`}
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

type ProductMediaDisplayProps = {
  product: ProductMediaSource;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  imagePreviewUrl?: string;
  videoPreviewUrl?: string;
};

export function ProductMediaDisplay({
  product,
  alt,
  className = "",
  fallback,
  imagePreviewUrl,
  videoPreviewUrl,
}: ProductMediaDisplayProps) {
  const video = getProductVideoSource(product);
  const videoSrc = useLocalAssetUrl(
    video?.assetId,
    mediaUrl(video?.url),
    videoPreviewUrl,
    "menu-products"
  );

  if (videoSrc) {
    return (
      <video
        src={videoSrc}
        className={className}
        preload="metadata"
        playsInline
        muted
        controls
      />
    );
  }

  return (
    <ProductMediaCarousel
      product={product}
      alt={alt}
      className={className}
      fallback={fallback}
      intervalMs={5000}
    />
  );
}
