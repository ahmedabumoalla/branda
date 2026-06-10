"use client";

import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import { ProductImage } from "@/components/cafe/product-image";
import type { MenuProduct } from "@/lib/mock/menu";

const FALLBACKS: Record<string, string> = {
  "قهوة": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1200&auto=format&fit=crop",
  "بارد": "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=1200&auto=format&fit=crop",
  "حلويات": "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?q=80&w=1200&auto=format&fit=crop",
  "مخبوزات": "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=1200&auto=format&fit=crop",
  "شاي": "https://images.unsplash.com/photo-1544787219-7f47ccb76574?q=80&w=1200&auto=format&fit=crop",
};

type ProductWithMedia = MenuProduct & { media?: Array<{ type: "image" | "video"; url?: string; assetId?: string }> };

export function ProductMedia({ product, className = "" }: { product: ProductWithMedia; className?: string }) {
  const media = product.media ?? [];
  const video = media.find((item) => item.type === "video" && item.url);
  const images = media.filter((item) => item.type === "image");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (video || images.length <= 1) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % images.length), 5000);
    return () => clearInterval(timer);
  }, [images.length, video]);

  if (video?.url) {
    return <video src={video.url} className={className} autoPlay muted loop playsInline controls={false} />;
  }

  const current = images[index];
  if (current?.url || current?.assetId) {
    return <img src={current.url} alt={product.name} className={className} loading="lazy" decoding="async" />;
  }

  return (
    <ProductImage
      product={{ ...product, imageDataUrl: product.imageDataUrl || FALLBACKS[product.category] }}
      alt={product.name}
      className={className}
      fallback={<Coffee className="h-12 w-12 opacity-30" />}
    />
  );
}
