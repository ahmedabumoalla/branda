"use client";

import {
  Coffee,
  Flame,
  Gift,
  MoreHorizontal,
  Pencil,
  Power,
  Trash2,
} from "lucide-react";
import { ProductMediaDisplay } from "@/components/cafe/product-image";
import { formatSar } from "@/lib/format";
import {
  isPromoActive,
  promoBadgeText,
  productFinalPrice,
  type MenuImageVariant,
  type MenuProduct,
} from "@/lib/mock/menu";
import { getBusinessCopy } from "@/lib/platform/business-copy";

const variantGradient: Record<MenuImageVariant, string> = {
  latte: "from-[#3b2416] via-[#5c3d2e] to-[#c78a45]",
  cold: "from-[#1e3a4a] via-[#496b4a] to-[#7eb8b8]",
  cake: "from-[#4a2c3d] via-[#8b5a6b] to-[#d4a59a]",
  bakery: "from-[#5c4a3a] via-[#8b7355] to-[#e8dcc8]",
  tea: "from-[#3d4f3f] via-[#496b4a] to-[#a8c4a9]",
};

type Props = {
  product: MenuProduct;
  categoryLabel?: string;
  freeProductLabel?: string;
  onEdit: () => void;
  onToggleAvailability: () => void;
  onDelete: () => void;
  businessCategory?: string;
};

export function MenuProductCard({
  product,
  categoryLabel,
  freeProductLabel,
  onEdit,
  onToggleAvailability,
  onDelete,
  businessCategory,
}: Props) {
  const copy = getBusinessCopy(businessCategory);
  const isEvents = copy.kind === "events";
  const promoOn = product.promo != null && isPromoActive(product.promo);
  const finalPrice = productFinalPrice(product.price, product.promo);
  const hasDiscountedPrice = promoOn && finalPrice < product.price;

  return (
    <article className="overflow-hidden rounded-3xl border border-white bg-white/80 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F8F4EF]">
        <ProductMediaDisplay
          product={product}
          alt=""
          className="h-full w-full object-contain bg-[#F8F4EF]"
          fallback={
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${variantGradient[product.imageVariant]}`}
            >
              <Coffee className="h-14 w-14 text-white/85" />
            </div>
          }
        />

        <div className="absolute inset-0 bg-gradient-to-t from-[#3A2117]/55 via-transparent to-transparent" />

        {product.promo ? (
          <span className="absolute right-3 top-3 flex max-w-[85%] items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-[#3A2117] shadow">
            <Gift className="h-3.5 w-3.5 text-[#8B5E3C]" />
            <span className="truncate">
              {promoOn ? promoBadgeText(product.promo) : "عرض غير نشط"}
            </span>
          </span>
        ) : null}

        <span
          className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black shadow ${
            product.available
              ? "bg-[#2E7D5B] text-white"
              : "bg-white text-[#3A2117]"
          }`}
        >
          {product.available ? "متاح" : "غير متاح"}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-black text-[#8B5E3C]">
              {categoryLabel ?? product.category}
            </p>

            <h3 className="mt-1 text-lg font-black text-[#3A2117]">
              {product.name}
            </h3>
          </div>

          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F8F4EF]">
            <MoreHorizontal className="h-5 w-5 text-[#7A6255]" />
          </span>
        </div>

        <p className="line-clamp-2 text-sm font-bold leading-relaxed text-[#7A6255]">
          {product.description}
        </p>

        <div className="flex flex-wrap gap-2">
          {product.ingredients.slice(0, 4).map((ing) => (
            <span
              key={ing}
              className="rounded-full bg-[#EFE8DF] px-3 py-1 text-[11px] font-black text-[#3A2117]"
            >
              {ing}
            </span>
          ))}
        </div>

        <div className="mt-auto grid grid-cols-3 gap-3 border-t border-[#EFE8DF] pt-4 text-center">
          <div>
            <p className="text-[10px] font-black text-[#7A6255]">
              {isEvents ? "رسوم الدخول" : "السعر"}
            </p>
            <p className="font-black text-[#3A2117]">
              {hasDiscountedPrice ? formatSar(finalPrice) : formatSar(product.price)}
            </p>
            {hasDiscountedPrice ? (
              <p className="text-[10px] font-black text-[#9B8B7B] line-through">
                {formatSar(product.price)}
              </p>
            ) : null}
          </div>

          <div>
            <p className="flex items-center justify-center gap-1 text-[10px] font-black text-[#7A6255]">
              <Flame className="h-3 w-3 text-[#8B5E3C]" />
              {isEvents ? "السعة" : "سعرات"}
            </p>

            <p className="font-black text-[#3A2117]">
              {isEvents
                ? product.eventTicketSettings?.capacity == null
                  ? "غير محدد"
                  : product.eventTicketSettings.capacity.toLocaleString("ar-SA")
                : product.calories === undefined
                  ? "غير محدد"
                  : product.calories.toLocaleString("ar-SA")}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black text-[#7A6255]">
              {isEvents ? "الدخول" : "الاستلام"}
            </p>
            <p className="font-black text-[#8B5E3C]">
              {isEvents
                ? product.eventTicketSettings?.checkinPolicy === "multi_use"
                  ? "متعدد"
                  : "مرة"
                : product.availableForPickup === false ? "لا" : "متاح"}
            </p>
          </div>
        </div>

        {product.promo ? (
          <p className="rounded-2xl bg-[#FFF3C4] px-3 py-2 text-xs font-bold text-[#7A5725]">
            فترة العرض {product.promo.startDate} إلى {product.promo.endDate}
          </p>
        ) : null}

        {product.promo?.kind === "منتج مجاني مع الطلب" && freeProductLabel ? (
          <p className="rounded-2xl bg-[#2E7D5B]/10 px-3 py-2 text-xs font-bold text-[#2E7D5B]">
            يشمل: <span className="font-black">{freeProductLabel}</span>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-[#EFE8DF] pt-4">
          <button
            type="button"
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#E5D8CD] bg-white py-2.5 text-xs font-black"
          >
            <Pencil className="h-4 w-4" />
            تعديل
          </button>

          <button
            type="button"
            onClick={onToggleAvailability}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#3A2117]/10 py-2.5 text-xs font-black text-[#3A2117]"
          >
            <Power className="h-4 w-4" />
            {product.available ? "إيقاف" : "تفعيل"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </button>
        </div>
      </div>
    </article>
  );
}
