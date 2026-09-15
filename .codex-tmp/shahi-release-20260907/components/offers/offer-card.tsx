"use client";

import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { useLocalAssetUrl } from "@/lib/cafe/use-local-asset-url";
import { formatSar } from "@/lib/format";
import type { CafeOffer } from "@/lib/mock/offers";

type Props = {
  offer: CafeOffer;
  href?: string;
  featured?: boolean;
  className?: string;
};

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date);
}

export function OfferCard({ offer, href, featured = false, className = "" }: Props) {
  const assetPath = offer.cardStoragePath || offer.bannerAssetId;
  const imageUrl = useLocalAssetUrl(
    assetPath,
    offer.bannerImageUrl,
    undefined,
    "offer-banners",
  );
  const content = (
    <article
      className={`group relative isolate aspect-[3/2] min-w-0 overflow-hidden rounded-[24px] border border-[var(--ci-border,#E7D7C6)] bg-[var(--ci-primary-bg,#6B3A25)] shadow-[0_18px_48px_rgba(49,25,18,0.14)] ${className}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading={featured ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,var(--ci-accent,#D9A33F),transparent_36%),linear-gradient(145deg,var(--ci-primary-bg,#6B3A25),var(--ci-text,#311912))]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <div className="relative flex h-full min-w-0 flex-col justify-end p-5 text-white sm:p-6">
        <div className="mb-auto flex flex-wrap items-start justify-between gap-2">
          <span className="rounded-full bg-white/16 px-3 py-1 text-xs font-black backdrop-blur">
            {offer.type}
          </span>
          {offer.discountPercent ? (
            <span className="rounded-full bg-[var(--ci-accent,#D9A33F)] px-3 py-1 text-sm font-black text-[var(--ci-text,#311912)]">
              خصم {offer.discountPercent}%
            </span>
          ) : null}
        </div>
        <h2 className={`break-words font-black leading-tight ${featured ? "text-2xl sm:text-4xl" : "text-xl sm:text-2xl"}`}>
          {offer.title}
        </h2>
        <p className="mt-2 line-clamp-2 max-w-2xl break-words text-sm font-bold leading-6 text-white/85">
          {offer.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-black text-white/85">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formatDate(offer.endDate) ? `حتى ${formatDate(offer.endDate)}` : "لفترة محدودة"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[var(--ci-text,#311912)]">
            {offer.ctaText || (offer.promoProductPrice != null ? formatSar(offer.promoProductPrice) : "تفاصيل العرض")}
            {href ? <ArrowLeft className="h-4 w-4" /> : null}
          </span>
        </div>
      </div>
    </article>
  );

  return href ? <Link href={href} prefetch={false} className="block min-w-0">{content}</Link> : content;
}
