"use client";

import { LocalAssetImage } from "@/components/ui/local-asset-image";
import type { CafeOffer } from "@/lib/mock/offers";
import { isHttpImageUrl } from "@/lib/cafe/image-asset-pipeline";

type Props = {
  offer: Pick<CafeOffer, "bannerAssetId" | "bannerImageUrl">;
  className?: string;
  fallbackSrc?: string;
};

export function OfferBannerImage({ offer, className = "", fallbackSrc }: Props) {
  const external =
    isHttpImageUrl(offer.bannerImageUrl) ? offer.bannerImageUrl : undefined;

  return (
    <LocalAssetImage
      assetId={offer.bannerAssetId}
      fallbackSrc={external ?? fallbackSrc}
      alt=""
      className={className}
    />
  );
}
