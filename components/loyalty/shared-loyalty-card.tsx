"use client";

import { RastStampCard } from "@/components/rast-loyalty/rast-stamp-card";
import { DEFAULT_LOYALTY_COLORS, readableBrandForeground, validBrandColor } from "@/lib/loyalty/approved-design";
import type { LoyaltyCardDesign, LoyaltyTextElementId } from "@/lib/loyalty/types";

export type LoyaltyGraphicLayer = "logo" | "points" | "barcode" | "qr";
export type LoyaltyDesignerLayer = `text:${LoyaltyTextElementId}` | LoyaltyGraphicLayer;
type Props = {
  card: Partial<LoyaltyCardDesign>;
  displayNumber?: string;
  pointsBalance?: number;
  pointValueSar?: number;
  compact?: boolean;
  editable?: boolean;
  pointsEnabled?: boolean;
  activeLayer?: LoyaltyDesignerLayer | null;
  onActiveLayerChange?: (layer: LoyaltyDesignerLayer) => void;
  onCardChange?: (card: LoyaltyCardDesign) => void;
};

export function LoyaltyBarcode({ value, dark = false, showValue = true }: { value: string; dark?: boolean; showValue?: boolean }) {
  return (
    <div className={`flex h-full min-h-0 flex-col justify-center rounded-xl border p-2 ${dark ? "border-white/15 bg-white/90" : "border-[#E7D7C6] bg-white"}`}>
      <div
        className="min-h-0 flex-1 rounded-md"
        style={{
          background:
            "repeating-linear-gradient(90deg,#17100d 0 2px,transparent 2px 5px,#17100d 5px 8px,transparent 8px 12px,#17100d 12px 13px,transparent 13px 17px)",
        }}
        aria-hidden="true"
      />
      {showValue ? <p className="mt-1 truncate text-center font-mono text-[10px] font-black tracking-[0.14em] text-[#17100d]">
        {value}
      </p> : null}
    </div>
  );
}


/** Every preview/customer surface uses the same approved stamp-card composition. */
export function SharedLoyaltyCard({ card, displayNumber, pointsBalance = 0, pointValueSar = 0, pointsEnabled }: Props) {
  const background = card.cardBackground?.toLowerCase() === "#f6be18" ? DEFAULT_LOYALTY_COLORS.background
    : validBrandColor(card.cardBackground) || DEFAULT_LOYALTY_COLORS.background;
  const code = card.sampleCode && card.sampleCode !== "LOYALTY-CARD" ? card.sampleCode : undefined;
  const balance = Number.isFinite(pointsBalance) ? Math.max(0, pointsBalance) : 0;
  return <div dir="rtl" data-loyalty-design="brand-stamps-v1">
    <RastStampCard identity={{ slug: card.brandSlug || "", name: card.brandName || "بطاقة الولاء", logoUrl: card.logoPreviewUrl || null,
      cardBackground: background, cardForeground: readableBrandForeground(background, card.cardForeground), cardAccent: validBrandColor(card.cardAccent) || DEFAULT_LOYALTY_COLORS.accent }}
      stamps={card.completedStamps || 0} required={card.stampsRequired || 7} rewardName={card.rewardTitle || "مكافأتك عند اكتمال الأختام"}
      cardCode={code} displayNumber={displayNumber} stampStyle={card.stampStyle} preview={!code}
      details={(pointsEnabled ?? card.pointsEnabled ?? card.pointsBadgeVisible) ? <p>رصيد النقاط <strong>{balance}</strong> · قيمة النقاط <strong>{(balance * Math.max(0, pointValueSar)).toFixed(2)} ر.س</strong></p> : null} />
  </div>;
}
