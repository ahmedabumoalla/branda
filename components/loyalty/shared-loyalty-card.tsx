"use client";

import { Crown, Gift, Heart, Star, Trophy } from "lucide-react";
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
  card: PartialLoyaltyCardDesign;
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
const REFERENCE_BACKGROUND = "#F6BE18";
const REFERENCE_FOREGROUND = "#17212B";
const REFERENCE_ACCENT = "#64BFA9";

const referenceLayers: Record<LoyaltyGraphicLayer, { x: number; y: number; width: number; height: number }> = {
  logo: { x: 84, y: 6, width: 10, height: 10 },
  points: { x: 5, y: 8, width: 33, height: 27 },
  barcode: { x: 40, y: 46, width: 53, height: 22 },
  qr: { x: 5, y: 50, width: 31, height: 42 },
};

const DEFAULT_GRAPHIC_LAYERS = referenceLayers;

const referenceText: Record<LoyaltyTextElementId, Omit<LoyaltyCardTextElement, "id" | "text" | "enabled">> = {
  brand: { x: 48, y: 7, width: 28, height: 6, fontSize: 11, fontWeight: 900, color: REFERENCE_FOREGROUND, align: "right" },
  title: { x: 49, y: 13, width: 44, height: 14, fontSize: 34, fontWeight: 900, color: REFERENCE_FOREGROUND, align: "right" },
  subtitle: { x: 45, y: 28, width: 48, height: 9, fontSize: 15, fontWeight: 800, color: REFERENCE_FOREGROUND, align: "right" },
  reward: { x: 40, y: 38, width: 53, height: 7, fontSize: 15, fontWeight: 900, color: REFERENCE_ACCENT, align: "right" },
  helper: { x: 53, y: 7, width: 40, height: 6, fontSize: 11, fontWeight: 900, color: "#FFFFFF", align: "center" },
  pointsLabel: { x: 8, y: 11, width: 28, height: 5, fontSize: 12, fontWeight: 900, color: "#806A5E", align: "right" },
  pointsValue: { x: 8, y: 18, width: 28, height: 6, fontSize: 17, fontWeight: 900, color: "#17100D", align: "right" },
  pointsValueSar: { x: 8, y: 26, width: 28, height: 5, fontSize: 12, fontWeight: 800, color: "#806A5E", align: "right" },
  barcodeLabel: { x: 42, y: 69, width: 49, height: 5, fontSize: 11, fontWeight: 900, color: "#17100D", align: "center" },
};

const textElementDefaults: Record<LoyaltyTextElementId, string> = {
  brand: "",
  title: "بطاقة الولاء",
  subtitle: "اجمع الأختام واستبدل مكافأتك بسهولة",
  reward: "مشروب مجاني عند اكتمال البطاقة",
  helper: "",
  pointsLabel: "نقاط الولاء",
  pointsValue: "{{points}} نقطة",
  pointsValueSar: "{{value}} ر.س",
  barcodeLabel: "{{code}}",
};

const textElementIds = Object.keys(textElementDefaults) as LoyaltyTextElementId[];

const DEFAULT_TEXT_ELEMENTS: Record<LoyaltyTextElementId, LoyaltyCardTextElement> = textElementIds.reduce(
  (elements, id) => {
    elements[id] = {
      id,
      text: textElementDefaults[id],
      enabled: id !== "brand" && id !== "helper",
      ...referenceText[id],
    };
    return elements;
  },
  {} as Record<LoyaltyTextElementId, LoyaltyCardTextElement>,
);

type PartialLoyaltyCardDesign = Partial<LoyaltyCardDesign> & {
  graphicLayers?: Partial<Record<LoyaltyGraphicLayer, Partial<(typeof DEFAULT_GRAPHIC_LAYERS)[LoyaltyGraphicLayer]> | null>> | null;
  textElements?: Partial<Record<LoyaltyTextElementId, Partial<LoyaltyCardTextElement> | null>> | null;
};

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

function isLegacyBrown(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    !normalized ||
    normalized === "#4a281d" ||
    normalized === "#3a2117" ||
    normalized.includes("#3a2117") ||
    normalized.includes("#4a281d") ||
    normalized.includes("#6b3a25")
  );
}

function resolveColors(card: PartialLoyaltyCardDesign) {
  const legacy = isLegacyBrown(card.cardBackground);
  return {
    background: legacy ? REFERENCE_BACKGROUND : card.cardBackground || REFERENCE_BACKGROUND,
    foreground: legacy ? REFERENCE_FOREGROUND : card.cardForeground || REFERENCE_FOREGROUND,
    accent: legacy ? REFERENCE_ACCENT : card.cardAccent || REFERENCE_ACCENT,
  };
}

function safeNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function safeText(value: unknown, fallback: string) {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function safeTextElements(card: PartialLoyaltyCardDesign): Record<LoyaltyTextElementId, LoyaltyCardTextElement> {
  return textElementIds.reduce((elements, id) => {
    const saved: Partial<LoyaltyCardTextElement> = card.textElements?.[id] ?? {};
    elements[id] = {
      ...DEFAULT_TEXT_ELEMENTS[id],
      ...saved,
      id,
      text: safeText(saved.text, DEFAULT_TEXT_ELEMENTS[id].text),
      enabled: id === "brand" || id === "helper" ? false : saved.enabled ?? DEFAULT_TEXT_ELEMENTS[id].enabled,
    };
    return elements;
  }, {} as Record<LoyaltyTextElementId, LoyaltyCardTextElement>);
}

function safeGraphicLayers(card: PartialLoyaltyCardDesign) {
  return (Object.keys(DEFAULT_GRAPHIC_LAYERS) as LoyaltyGraphicLayer[]).reduce((layers, layer) => {
    layers[layer] = {
      ...DEFAULT_GRAPHIC_LAYERS[layer],
      ...(card.graphicLayers?.[layer] ?? {}),
    };
    return layers;
  }, {} as Record<LoyaltyGraphicLayer, { x: number; y: number; width: number; height: number }>);
}

function safeCardDesign(card: PartialLoyaltyCardDesign): LoyaltyCardDesign & { graphicLayers: ReturnType<typeof safeGraphicLayers> } {
  const colors = resolveColors(card);
  const stampsRequired = Math.max(1, Math.min(100, safeNumber(card.stampsRequired, 7)));
  const completedStamps = Math.max(0, Math.min(stampsRequired, safeNumber(card.completedStamps, 0)));
  return {
    enabled: card.enabled ?? true,
    brandName: safeText(card.brandName, ""),
    cardTitle: safeText(card.cardTitle, textElementDefaults.title),
    subtitle: safeText(card.subtitle, textElementDefaults.subtitle),
    rewardTitle: safeText(card.rewardTitle, textElementDefaults.reward),
    supportingText: safeText(card.supportingText, ""),
    stampLabel: safeText(card.stampLabel, "ختم"),
    terms: safeText(card.terms, ""),
    stampsRequired,
    completedStamps,
    cardBackground: colors.background,
    cardForeground: colors.foreground,
    cardAccent: colors.accent,
    logoPreviewUrl: card.logoPreviewUrl,
    logoRemoveLightBackground: card.logoRemoveLightBackground ?? false,
    logoBackgroundTolerance: safeNumber(card.logoBackgroundTolerance, 20),
    logoPlacement: card.logoPlacement ?? "top-right",
    logoSize: safeNumber(card.logoSize, 18),
    logoOffsetX: safeNumber(card.logoOffsetX, 0),
    logoOffsetY: safeNumber(card.logoOffsetY, 0),
    logoX: safeNumber(card.logoX, DEFAULT_GRAPHIC_LAYERS.logo.x),
    logoY: safeNumber(card.logoY, DEFAULT_GRAPHIC_LAYERS.logo.y),
    logoWidth: safeNumber(card.logoWidth, DEFAULT_GRAPHIC_LAYERS.logo.width),
    logoHeight: safeNumber(card.logoHeight, DEFAULT_GRAPHIC_LAYERS.logo.height),
    progressIcon: card.progressIcon && progressIcons[card.progressIcon] ? card.progressIcon : "star",
    customIconPreviewUrl: card.customIconPreviewUrl,
    barcodeVisible: card.barcodeVisible ?? true,
    barcodeX: safeNumber(card.barcodeX, DEFAULT_GRAPHIC_LAYERS.barcode.x),
    barcodeY: safeNumber(card.barcodeY, DEFAULT_GRAPHIC_LAYERS.barcode.y),
    barcodeWidth: safeNumber(card.barcodeWidth, DEFAULT_GRAPHIC_LAYERS.barcode.width),
    barcodeHeight: safeNumber(card.barcodeHeight, DEFAULT_GRAPHIC_LAYERS.barcode.height),
    qrX: safeNumber(card.qrX, DEFAULT_GRAPHIC_LAYERS.qr.x),
    qrY: safeNumber(card.qrY, DEFAULT_GRAPHIC_LAYERS.qr.y),
    qrWidth: safeNumber(card.qrWidth, DEFAULT_GRAPHIC_LAYERS.qr.width),
    qrHeight: safeNumber(card.qrHeight, DEFAULT_GRAPHIC_LAYERS.qr.height),
    pointsBadgeVisible: card.pointsBadgeVisible ?? true,
    pointsBadgeX: safeNumber(card.pointsBadgeX, DEFAULT_GRAPHIC_LAYERS.points.x),
    pointsBadgeY: safeNumber(card.pointsBadgeY, DEFAULT_GRAPHIC_LAYERS.points.y),
    pointsBadgeWidth: safeNumber(card.pointsBadgeWidth, DEFAULT_GRAPHIC_LAYERS.points.width),
    pointsBadgeHeight: safeNumber(card.pointsBadgeHeight, DEFAULT_GRAPHIC_LAYERS.points.height),
    sampleCode: safeText(card.sampleCode, "LOYALTY-CARD"),
    textElements: safeTextElements(card),
    graphicLayers: safeGraphicLayers(card),
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
    const textElement = getTextElement(card, textLayerId(layer));
    return { width: textElement.width, height: textElement.height };
  }
  const metrics = getGraphicLayer(card, layer);
  return { width: metrics.width, height: metrics.height };
}

function getGraphicLayer(card: PartialLoyaltyCardDesign, layer: LoyaltyGraphicLayer) {
  return {
    ...DEFAULT_GRAPHIC_LAYERS[layer],
    ...(card.graphicLayers?.[layer] ?? {}),
  };
}

function getTextElement(card: PartialLoyaltyCardDesign, id: LoyaltyTextElementId): LoyaltyCardTextElement {
  const saved: Partial<LoyaltyCardTextElement> = card.textElements?.[id] ?? {};
  const legacyText: Partial<Record<LoyaltyTextElementId, string>> = {
    pointsLabel: "نقاط الولاء",
    pointsValue: "{{points}} نقطة",
    pointsValueSar: "{{value}} ر.س",
    barcodeLabel: "{{code}}",
  };
  const fallback = DEFAULT_TEXT_ELEMENTS[id];
  const layout = {
    ...referenceText[id],
    text: legacyText[id] ?? safeText(saved.text, fallback.text),
    enabled: id === "brand" || id === "helper" ? false : saved.enabled ?? fallback.enabled,
  };
  const text =
    id === "subtitle" && layout.text === "اجمع الأختام واحصل على مكافأتك"
      ? "اجمع الأختام واستبدل مكافأتك بسهولة"
      : layout.text;
  return {
    ...fallback,
    ...saved,
    ...layout,
    text,
    color:
      id === "title" || id === "subtitle" || id === "brand"
        ? REFERENCE_FOREGROUND
        : id === "reward"
          ? REFERENCE_ACCENT
          : layout.color,
  };
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
  const safeCard = safeCardDesign(card);
  const ProgressIcon = progressIcons[safeCard.progressIcon] ?? Star;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [surfaceScale, setSurfaceScale] = useState(1);
  const safePointsBalance = safeNumber(pointsBalance, 320);
  const safePointValueSar = safeNumber(pointValueSar, 0.25);
  const earnedValue = Math.round(safePointsBalance * safePointValueSar * 100) / 100;
  const stamps = Array.from({ length: safeCard.stampsRequired });
  const logoVisible = Boolean(safeCard.logoPreviewUrl);
  const showPoints = true;
  const showBarcode = true;
  const colors = resolveColors(safeCard);
  const textElements = textElementIds.map((id) => getTextElement(safeCard, id));
  const pointsLayer = getGraphicLayer(safeCard, "points");
  const barcodeLayer = getGraphicLayer(safeCard, "barcode");
  const qrLayer = getGraphicLayer(safeCard, "qr");
  const logoLayer = getGraphicLayer(safeCard, "logo");

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
    const metrics = getLayerMetrics(safeCard, layer);
    const width = clamp(metrics.width, 1, 100);
    const height = clamp(metrics.height, 1, 100);

    function move(moveEvent: globalThis.PointerEvent) {
      const nextX = clamp(((moveEvent.clientX - activeRect.left) / activeRect.width) * 100 - width / 2, 0, 100 - width);
      const nextY = clamp(((moveEvent.clientY - activeRect.top) / activeRect.height) * 100 - height / 2, 0, 100 - height);
      updateCard(applyLayerPosition(safeCard, layer, nextX, nextY));
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
      .replaceAll("{{points}}", String(safePointsBalance))
      .replaceAll("{{value}}", String(earnedValue))
      .replaceAll("{{code}}", safeCard.sampleCode);
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
      className={`relative mx-auto w-full overflow-hidden rounded-[20px] border border-black/10 text-right shadow-[0_24px_70px_rgba(49,25,18,0.20)] ${
        compact ? "max-w-[620px]" : "max-w-[940px]"
      } ${editable ? "select-none ring-2 ring-[#D9A33F]/25" : ""}`}
      style={{
        aspectRatio: `${CARD_DESIGN_WIDTH} / ${CARD_DESIGN_HEIGHT}`,
        background: colors.background,
        color: colors.foreground,
      }}
      dir="rtl"
    >
      {/* Public/compact views must scale the whole card, never re-layout elements. */}
      <div
        className="absolute right-0 top-0 overflow-hidden rounded-[20px] p-5 text-right"
        style={{
          width: CARD_DESIGN_WIDTH,
          height: CARD_DESIGN_HEIGHT,
          transform: `scale(${surfaceScale})`,
          transformOrigin: "top right",
          background: colors.background,
          color: colors.foreground,
        }}
      >
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 18% 18%, rgba(255,255,255,0.58), transparent 28%), radial-gradient(circle at 88% 92%, rgba(255,255,255,0.28), transparent 32%)" }} />
        <div className="absolute right-8 bottom-7 z-10 w-[54%] rounded-[20px] bg-white/18 p-3 ring-1 ring-black/5">
          <div className="grid grid-cols-8 gap-2.5">
            {stamps.map((_, index) => {
              const filled = index < safeCard.completedStamps;
              return (
                <span
                  key={index}
                  className={`flex aspect-square items-center justify-center rounded-full border text-[10px] font-black shadow-sm ${
                    filled ? "border-transparent" : "border-black/25 bg-white/72"
                  }`}
                  style={filled ? { background: colors.accent, color: colors.foreground } : { color: colors.accent }}
                >
                  {safeCard.customIconPreviewUrl ? (
                    <img src={safeCard.customIconPreviewUrl} alt="" className="h-4 w-4 object-contain" />
                  ) : (
                    <ProgressIcon className={filled ? "h-5 w-5" : "h-4 w-4"} />
                  )}
                </span>
              );
            })}
          </div>
        </div>

      {logoVisible ? (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => selectLayer("logo")}
          onPointerDown={(event) => startDrag(event, "logo")}
          className={`absolute z-20 rounded-xl ${activeRing("logo")}`}
          style={layerStyle(logoLayer.x, logoLayer.y, logoLayer.width, logoLayer.height)}
        >
          <img src={safeCard.logoPreviewUrl} alt="" className="h-full w-full object-contain" />
        </div>
      ) : null}

      {showPoints ? (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => selectLayer("points")}
          onPointerDown={(event) => startDrag(event, "points")}
          className={`absolute z-20 flex flex-col justify-center rounded-[22px] border border-black/10 bg-white/94 px-5 text-[#17100d] shadow-[0_18px_40px_rgba(23,16,13,0.16)] ${activeRing("points")}`}
          style={layerStyle(pointsLayer.x, pointsLayer.y, pointsLayer.width, pointsLayer.height)}
        >
          <p className="text-[21px] font-black leading-none text-[#806A5E]">{resolveText(getTextElement(card, "pointsLabel"))}</p>
          <p className="mt-3 text-[38px] font-black leading-none text-[#17100D]">{resolveText(getTextElement(card, "pointsValue"))}</p>
          <p className="mt-3 text-[24px] font-extrabold leading-none text-[#806A5E]">{resolveText(getTextElement(card, "pointsValueSar"))}</p>
        </div>
      ) : null}

      {showBarcode ? (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          onClick={() => selectLayer("barcode")}
          onPointerDown={(event) => startDrag(event, "barcode")}
          className={`absolute z-20 ${activeRing("barcode")}`}
          style={layerStyle(barcodeLayer.x, barcodeLayer.y, barcodeLayer.width, barcodeLayer.height)}
        >
          <LoyaltyBarcode value={safeCard.sampleCode} showValue={false} />
        </div>
      ) : null}

      <div
        role={editable ? "button" : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={() => selectLayer("qr")}
        onPointerDown={(event) => startDrag(event, "qr")}
        className={`absolute z-20 flex items-center justify-center rounded-[24px] bg-white p-4 text-[#17100d] shadow-[0_20px_46px_rgba(23,16,13,0.18)] ${activeRing("qr")}`}
        style={layerStyle(qrLayer.x, qrLayer.y, qrLayer.width, qrLayer.height)}
      >
        <SecureQrCode
          kind="loyalty-card"
          value={safeCard.sampleCode}
          title={"QR \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0648\u0644\u0627\u0621"}
          fit
          className="h-full w-full"
        />
      </div>

      {textElements.map((element) => {
        if (!element.enabled) return null;
        if (element.id === "pointsLabel" || element.id === "pointsValue" || element.id === "pointsValueSar") return null;
        if (!showBarcode && element.id === "barcodeLabel") return null;
        const layer = `text:${element.id}` as const;
        const helperClass =
          element.id === "helper" ? "hidden" : element.id === "barcodeLabel" ? "flex items-center justify-center font-mono tracking-[0.16em]" : "";
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
