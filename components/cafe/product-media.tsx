"use client";

import { useState } from "react";
import { Coffee } from "lucide-react";
import {
  AutoplayProductVideo,
  ProductImage,
} from "@/components/cafe/product-image";
import type { MenuProduct } from "@/lib/mock/menu";

type ProductWithMedia = MenuProduct & { media?: Array<{ type: "image" | "video"; url?: string; assetId?: string }> };

export function ProductMedia({ product, className = "" }: { product: ProductWithMedia; className?: string }) {
  const media = product.media ?? [];
  const video = media.find((item) => item.type === "video" && item.url);
  const images = media.filter((item) => item.type === "image");
  const [index, setIndex] = useState(0);

  if (video?.url) {
    return (
      <AutoplayProductVideo
        src={video.url}
        className={className}
        label={product.name}
      />
    );
  }

  const current = images[index];
  if (current?.url) {
    return (
      <div className="relative h-full w-full">
        <img src={current.url} alt={product.name} className={className} loading="lazy" decoding="async" />
        {images.length > 1 ? (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/25 px-2 py-1 backdrop-blur">
            {images.map((_, itemIndex) => (
              <button
                key={itemIndex}
                type="button"
                aria-label={`عرض صورة ${itemIndex + 1}`}
                onClick={() => setIndex(itemIndex)}
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

  return (
    <ProductImage
      product={product}
      alt={product.name}
      className={className}
      fallback={<Coffee className="h-12 w-12 opacity-30" />}
    />
  );
}
