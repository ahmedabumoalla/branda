"use client";

import { Crown, Gift, Heart, Star, Trophy, WalletCards } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { SecureQrCode } from "@/components/loyalty/secure-qr-code";
import type {
  LoyaltyCardDesign,
  LoyaltyCardTextElement,
  LoyaltyProgressIcon,
  LoyaltyTextElementId,
} from "@/lib/loyalty/types";

export type LoyaltyGraphicLayer = "logo" | "points" | "barcode" | "qr";
export type LoyaltyDesignerLayer = LoyaltyGraphicLayer | `text:${LoyaltyTextElementId}`;

type Props = {
  card: LoyaltyCardDesign;
  pointsBalance?: number;
  pointValueSar?: number;
  compact?: boolean;
  editable?: boolean;
  activeLayer?: LoyaltyDesignerLayer | null;
  onActiveLayerChange?: (layer: LoyaltyDesignerLayer) => void;
  onCardChange?: (card: LoyaltyCardDesign) => void;
};

const progressIcons: Record<LoyaltyProgressIcon, typeof Star> = {
  star: Star,
  cup: Trophy,
  gift: Gift,
  heart: Heart,
  crown: Crown,
};

const CARD_DESIGN_WIDTH = 760;
const CARD_DESIGN_HEIGHT = 480;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function layerStyle(x: number, y: number, width: number, height: number) {
  const safeWidth = clamp(width, 1, 100);
  const safeHeight = clamp(height, 1, 100);
  const safeX = clamp(x, 0, 100 - safeWidth);
  const safeY = clamp(y, 0, 100 - safeHeight);

  return {
    left: `${safeX}%`,
    top: `${safeY}%`,
    width: `${safeWidth}%`,
    height: `${safeHeight}%`,
  };
}

function isTextLayer(layer: LoyaltyDesignerLayer): layer is `text:${LoyaltyTextElementId}` {
  return layer.startsWith("text:");
}

function textLayerId(layer: `text:${LoyaltyTextElementId}`) {
  return layer.slice(5) as LoyaltyTextElementId;
}

function getLayerMetrics(card: LoyaltyCardDesign, layer: LoyaltyDesignerLayer) {
  if (isTextLayer(layer)) {
    const textElement = card.textElements[textLayerId(layer)];
    return { width: textElement.width, height: textElement.height };
  }
  if (layer === "logo") return { width: card.logoWidth, height: card.logoHeight };
  if (layer === "points") return { width: card.pointsBadgeWidth, height: card.pointsBadgeHeight };
  if (layer === "qr") return { width: card.qrWidth, height: card.qrHeight };
  return { width: card.barcodeWidth, height: card.barcodeHeight };
}

function applyLayerPosition(card: LoyaltyCardDesign, layer: LoyaltyDesignerLayer, x: number, y: number) {
  if (isTextLayer(layer)) {
    const id = textLayerId(layer);
    return {
      ...card,
      textElements: {
        ...card.textElements,
        [id]: { ...card.textElements[id], x, y },
      },
    };
  }
  if (layer === "logo") return { ...card, logoX: x, logoY: y };
  if (layer === "points") return { ...card, pointsBadgeX: x, pointsBadgeY: y };
  if (layer === "qr") return { ...card, qrX: x, qrY: y };
  return { ...card, barcodeX: x, barcodeY: y };
}

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

export function SharedLoyaltyCard({
  card,
  pointsBalance = 320,
  pointValueSar = 0.25,
  compact = false,
  editable = false,
  activeLayer = null,
  onActiveLayerChange,
  onCardChange,
}: Props) {
  const ProgressIcon = progressIcons[card.progressIcon];
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [surfaceScale, setSurfaceScale] = useState(1);
  const earnedValue = Math.round(pointsBalance * pointValueSar * 100) / 100;
  const stamps = Array.from({ length: Math.max(1, card.stampsRequired) });
  const logoVisible = Boolean(card.logoPreviewUrl);
  const showPoints = card.pointsBadgeVisible;
  const textElements = Object.values(card.textElements);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const targetNode = node;

    function updateScale() {
      const width = targetNode.getBoundingClientRect().width || CARD_DESIGN_WIDTH;
      setSurfaceScale(width / CARD_DESIGN_WIDTH);
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(targetNode);

    return () => observer.disconnect();
  }, []);

  function activeRing(layer: LoyaltyDesignerLayer) {
    if (!editable) return "";
    return activeLayer === layer
      ? "cursor-move ring-2 ring-[#F6C35B] shadow-[0_0_0_4px_rgba(246,195,91,0.18)]"
      : "cursor-move ring-2 ring-[#D9A33F]/45";
  }

  function selectLayer(layer: LoyaltyDesignerLayer) {
    onActiveLayerChange?.(layer);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>, layer: LoyaltyDesignerLayer) {
    if (!editable || !onCardChange) return;
    selectLayer(layer);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const activeRect = rect;
    const updateCard = onCardChange;
    const metrics = getLayerMetrics(card, layer);
    const width = clamp(metrics.width, 1, 100);
    const height = clamp(metrics.height, 1, 100);

    function move(moveEvent: globalThis.PointerEvent) {
      const nextX = clamp(((moveEvent.clientX - activeRect.left) / activeRect.width) * 100 - width / 2, 0, 100 - width);
      const nextY = clamp(((moveEvent.clientY - activeRect.top) / activeRect.height) * 100 - height / 2, 0, 100 - height);
      updateCard(applyLayerPosition(card, layer, nextX, nextY));
    }

    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resolveText(element: LoyaltyCardTextElement) {
    return element.text
      .replaceAll("{{points}}", String(pointsBalance))
      .replaceAll("{{value}}", String(earnedValue))
      .replaceAll("{{code}}", card.sampleCode);
  }

  function textStyle(element: LoyaltyCardTextElement) {
    return {
      ...layerStyle(element.x, element.y, element.width, element.height),
      color: element.color,
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      textAlign: element.align,
      lineHeight: 1.25,
    };
  }

  return (
    <div
      ref={cardRef}
      className={`relative mx-auto w-full overflow-hidden rounded-[18px] border border-black/10 text-right shadow-[0_24px_70px_rgba(49,25,18,0.20)] ${
        compact ? "max-w-[440px]" : "max-w-[860px]"
      } ${editable ? "select-none ring-2 ring-[#D9A33F]/25" : ""}`}
      style={{
        aspectRatio: `${CARD_DESIGN_WIDTH} / ${CARD_DESIGN_HEIGHT}`,
        background: card.cardBackground,
        color: card.cardForeground,
      }}
      dir="rtl"
    >
      {/* Public/compact views must scale the whole card, never re-layout elements. */}
      <div
        className="absolute right-0 top-0 overflow-hidden rounded-[18px] p-5 text-right"
        style={{
          width: CARD_DESIGN_WIDTH,
          height: CARD_DESIGN_HEIGHT,
          transform: `scale(${surfaceScale})`,
          transformOrigin: "top right",
          background: card.cardBackground,
          color: card.cardForeground,
        }}
      >
        <div className="relative z-10 flex h-full flex-col">
          <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 pe-16" />
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: card.cardAccent, color: card.cardForeground }}>
            <WalletCards className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-auto max-w-[55%] rounded-[14px] bg-white/14 p-3">
          <div className="grid grid-cols-8 gap-1.5">
            {stamps.map((_, index) => {
              const filled = index < card.completedStamps;
              return (
                <span
                  key={index}
                  className={`flex aspect-square items-center justify-center rounded-lg border text-[10px] font-black ${
                    filled ? "border-transparent" : "border-white/30 bg-white/10 opacity-80"
                  }`}
                  style={filled ? { background: card.cardAccent, color: card.cardForeground } : undefined}
                >
                  {card.customIconPreviewUrl ? (
                    <img src={card.customIconPreviewUrl} alt="" className="h-4 w-4 object-contain" />
                  ) : (
                    <ProgressIcon className="h-3.5 w-3.5" />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {logoVisible ? (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => selectLayer("logo")}
          onPointerDown={(event) => startDrag(event, "logo")}
          className={`absolute z-20 rounded-xl ${activeRing("logo")}`}
          style={layerStyle(card.logoX, card.logoY, card.logoWidth, card.logoHeight)}
        >
          <img src={card.logoPreviewUrl} alt="" className="h-full w-full object-contain" />
        </div>
      ) : null}

      {showPoints ? (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => selectLayer("points")}
          onPointerDown={(event) => startDrag(event, "points")}
          className={`absolute z-20 flex flex-col justify-center rounded-xl border border-white/15 bg-white/90 px-3 text-[#17100d] shadow-lg ${activeRing("points")}`}
          style={layerStyle(card.pointsBadgeX, card.pointsBadgeY, card.pointsBadgeWidth, card.pointsBadgeHeight)}
        >
        </div>
      ) : null}

      {card.barcodeVisible ? (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => selectLayer("barcode")}
          onPointerDown={(event) => startDrag(event, "barcode")}
          className={`absolute z-20 ${activeRing("barcode")}`}
          style={layerStyle(card.barcodeX, card.barcodeY, card.barcodeWidth, card.barcodeHeight)}
        >
          <LoyaltyBarcode value={card.sampleCode} showValue={false} />
        </div>
      ) : null}

      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => selectLayer("qr")}
        onPointerDown={(event) => startDrag(event, "qr")}
        className={`absolute z-20 flex items-center justify-center rounded-xl bg-white p-1 text-[#17100d] ${activeRing("qr")}`}
        style={layerStyle(card.qrX, card.qrY, card.qrWidth, card.qrHeight)}
      >
        <SecureQrCode
          kind="loyalty-card"
          value={card.sampleCode}
          title={"QR \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0648\u0644\u0627\u0621"}
          fit
          className="h-full w-full"
        />
      </div>

      {textElements.map((element) => {
        if (!element.enabled) return null;
        if (!showPoints && (element.id === "pointsLabel" || element.id === "pointsValue" || element.id === "pointsValueSar")) return null;
        if (!card.barcodeVisible && element.id === "barcodeLabel") return null;
        const layer = `text:${element.id}` as const;
        const helperClass =
          element.id === "helper" ? "flex items-center justify-center rounded-xl bg-black/35 px-3 py-1 backdrop-blur" : "";
        return (
          <div
            key={element.id}
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            onClick={() => selectLayer(layer)}
            onPointerDown={(event) => startDrag(event, layer)}
            className={`absolute z-30 overflow-hidden whitespace-pre-wrap break-words ${helperClass} ${activeRing(layer)}`}
            style={textStyle(element)}
          >
            {resolveText(element)}
          </div>
        );
      })}
      </div>
    </div>
  );
}
