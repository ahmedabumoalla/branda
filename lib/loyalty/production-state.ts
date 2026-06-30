import type {
  LoyaltyCardDesign,
  LoyaltyDashboardState,
  LoyaltyPointsSettings,
  LoyaltyTextElementId,
} from "@/lib/loyalty/types";
import type { LoyaltyCardProgram, LoyaltyBrandCard } from "@/lib/data/loyalty-cards";
import type { LoyaltySettings } from "@/lib/mock/loyalty";

const fallbackProgram = {
  enabled: true,
  cardTitle: "بطاقة الولاء",
  cardSubtitle: "اجمع الأختام واستبدل مكافأتك بسهولة",
  purchasesRequired: 7,
  rewardName: "مشروب مجاني عند اكتمال البطاقة",
  stampLabel: "ختم",
  terms: "",
  cardBackground: "#F6BE18",
  cardForeground: "#17212B",
  cardAccent: "#64BFA9",
};

const referenceLayoutVersion = "reference-horizontal-v1" as const;
const oldDefaultBackgrounds = new Set(["#4A281D", "#3A2117"]);

function safeCardBackground(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return oldDefaultBackgrounds.has(normalized.toUpperCase()) ? fallbackProgram.cardBackground : normalized || fallbackProgram.cardBackground;
}

function safeCardSubtitle(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "اجمع الأختام واحصل على مكافأتك" ? fallbackProgram.cardSubtitle : normalized;
}

function textElement(
  id: LoyaltyTextElementId,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  enabled = true,
) {
  return {
    id,
    text,
    x,
    y,
    width,
    height,
    fontSize,
    fontWeight: 900,
    color: "#17212B",
    align: "right" as const,
    enabled,
  };
}

function sanitizeDesign(input: LoyaltyCardDesign, patch: Partial<LoyaltyCardDesign>): LoyaltyCardDesign {
  const next = { ...input, ...patch };
  return {
    ...next,
    layoutVersion: referenceLayoutVersion,
    pointsEnabled: next.pointsEnabled ?? next.pointsBadgeVisible ?? true,
    subtitle: safeCardSubtitle(next.subtitle),
    stampsRequired: Math.max(1, Math.min(100, Number(next.stampsRequired || 7))),
    completedStamps: Math.max(0, Math.min(Number(next.stampsRequired || 7), Number(next.completedStamps || 0))),
    cardBackground: safeCardBackground(next.cardBackground),
    cardForeground: next.cardForeground || fallbackProgram.cardForeground,
    cardAccent: next.cardAccent || fallbackProgram.cardAccent,
    barcodeX: 40,
    barcodeY: 46,
    barcodeWidth: 53,
    barcodeHeight: 22,
    qrX: 5,
    qrY: 50,
    qrWidth: 31,
    qrHeight: 42,
    pointsBadgeX: 5,
    pointsBadgeY: 8,
    pointsBadgeWidth: 33,
    pointsBadgeHeight: 27,
    textElements: {
      ...input.textElements,
      ...(next.textElements ?? {}),
      brand: { ...input.textElements.brand, ...(next.textElements?.brand ?? {}), enabled: false, color: "#17212B", x: 48, y: 7, width: 28, height: 6, fontSize: 11 },
      title: { ...input.textElements.title, ...(next.textElements?.title ?? {}), text: next.cardTitle || input.cardTitle, color: "#17212B", x: 49, y: 13, width: 44, height: 14, fontSize: 34 },
      subtitle: { ...input.textElements.subtitle, ...(next.textElements?.subtitle ?? {}), text: safeCardSubtitle(next.subtitle || input.subtitle), color: "#17212B", x: 45, y: 28, width: 48, height: 9, fontSize: 15, fontWeight: 800 },
      reward: { ...input.textElements.reward, ...(next.textElements?.reward ?? {}), text: next.rewardTitle || input.rewardTitle, color: next.cardAccent || fallbackProgram.cardAccent, x: 40, y: 38, width: 53, height: 7, fontSize: 15 },
      helper: { ...input.textElements.helper, ...(next.textElements?.helper ?? {}), enabled: false, x: 53, y: 7, width: 40, height: 6, fontSize: 11 },
      pointsLabel: { ...input.textElements.pointsLabel, ...(next.textElements?.pointsLabel ?? {}), text: "نقاط الولاء", enabled: true, x: 8, y: 11, width: 28, height: 5, fontSize: 12, color: "#806A5E" },
      pointsValue: { ...input.textElements.pointsValue, ...(next.textElements?.pointsValue ?? {}), text: "{{points}} نقطة", enabled: true, x: 8, y: 18, width: 28, height: 6, fontSize: 17, color: "#17100D" },
      pointsValueSar: { ...input.textElements.pointsValueSar, ...(next.textElements?.pointsValueSar ?? {}), text: "{{value}} ر.س", enabled: true, x: 8, y: 26, width: 28, height: 5, fontSize: 12, color: "#806A5E" },
      barcodeLabel: { ...input.textElements.barcodeLabel, ...(next.textElements?.barcodeLabel ?? {}), text: "{{code}}", x: 42, y: 69, width: 49, height: 5, fontSize: 11, color: "#17100D", align: "center" },
    },
  };
}

export function buildLoyaltyCardDesign(input: {
  cafeName: string;
  program?: Partial<LoyaltyCardProgram> | null;
  card?: Partial<LoyaltyBrandCard> | null;
  pointsVisible?: boolean;
}): LoyaltyCardDesign {
  const program = { ...fallbackProgram, ...(input.program ?? {}) };
  const required = Math.max(1, Number(program.purchasesRequired || 7));
  const completed = Math.max(0, Math.min(required, Number(input.card?.stampsInCycle ?? 0)));
  const code = String(input.card?.cardCode ?? "");
  const base: LoyaltyCardDesign = {
    layoutVersion: referenceLayoutVersion,
    enabled: Boolean(program.enabled ?? true),
    brandName: input.cafeName,
    cardTitle: String(program.cardTitle || fallbackProgram.cardTitle),
    subtitle: safeCardSubtitle(String(program.cardSubtitle || fallbackProgram.cardSubtitle)),
    rewardTitle: String(program.rewardName || fallbackProgram.rewardName),
    supportingText: "اعرض البطاقة عند الكاشير",
    stampLabel: String(program.stampLabel || fallbackProgram.stampLabel),
    terms: String(program.terms || ""),
    stampsRequired: required,
    completedStamps: completed,
    cardBackground: safeCardBackground(String(program.cardBackground || fallbackProgram.cardBackground)),
    cardForeground: String(program.cardForeground || fallbackProgram.cardForeground),
    cardAccent: String(program.cardAccent || fallbackProgram.cardAccent),
    logoRemoveLightBackground: false,
    logoBackgroundTolerance: 20,
    logoPlacement: "top-right",
    logoSize: 18,
    logoOffsetX: 0,
    logoOffsetY: 0,
    logoX: 73,
    logoY: 8,
    logoWidth: 16,
    logoHeight: 16,
    progressIcon: "star",
    barcodeVisible: true,
    barcodeX: 40,
    barcodeY: 46,
    barcodeWidth: 53,
    barcodeHeight: 22,
    qrX: 5,
    qrY: 50,
    qrWidth: 31,
    qrHeight: 42,
    pointsBadgeVisible: Boolean(input.pointsVisible ?? true),
    pointsEnabled: Boolean(input.pointsVisible ?? true),
    pointsBadgeX: 5,
    pointsBadgeY: 8,
    pointsBadgeWidth: 33,
    pointsBadgeHeight: 27,
    sampleCode: code || "LOYALTY-CARD",
    textElements: {
      brand: { ...textElement("brand", input.cafeName, 48, 7, 28, 6, 11, false), color: "#17212B" },
      title: textElement("title", String(program.cardTitle || fallbackProgram.cardTitle), 49, 13, 44, 14, 34),
      subtitle: { ...textElement("subtitle", safeCardSubtitle(String(program.cardSubtitle || fallbackProgram.cardSubtitle)), 45, 28, 48, 9, 15), fontWeight: 800 },
      reward: { ...textElement("reward", String(program.rewardName || fallbackProgram.rewardName), 40, 38, 53, 7, 15), color: String(program.cardAccent || fallbackProgram.cardAccent) },
      helper: textElement("helper", "", 53, 7, 40, 6, 11, false),
      pointsLabel: { ...textElement("pointsLabel", "نقاط الولاء", 8, 11, 28, 5, 12, true), color: "#806A5E" },
      pointsValue: { ...textElement("pointsValue", "{{points}} نقطة", 8, 18, 28, 6, 17, true), color: "#17100D" },
      pointsValueSar: { ...textElement("pointsValueSar", "{{value}} ر.س", 8, 26, 28, 5, 12, true), color: "#806A5E", fontWeight: 800 },
      barcodeLabel: { ...textElement("barcodeLabel", "{{code}}", 42, 69, 49, 5, 11), color: "#17100D", align: "center" },
    },
  };

  const savedDesign = input.program?.cardDesign;
  if (!savedDesign || typeof savedDesign !== "object") return base;

  return sanitizeDesign(base, {
    ...savedDesign,
    enabled: base.enabled,
    brandName: savedDesign.brandName || base.brandName,
    cardTitle: savedDesign.cardTitle || base.cardTitle,
    subtitle: savedDesign.subtitle || base.subtitle,
    rewardTitle: savedDesign.rewardTitle || base.rewardTitle,
    stampLabel: savedDesign.stampLabel || base.stampLabel,
    terms: savedDesign.terms || base.terms,
    stampsRequired: base.stampsRequired,
    completedStamps: base.completedStamps,
    sampleCode: code || savedDesign.sampleCode || base.sampleCode,
  });
}

export function buildLoyaltyPointsState(settings: LoyaltySettings): LoyaltyPointsSettings {
  const firstRedemption = settings.redemptionRules.find((rule) => rule.enabled) ?? settings.redemptionRules[0];
  const firstEarn = settings.earnRules.find((rule) => rule.enabled) ?? settings.earnRules[0];
  return {
    enabled: Boolean(settings.enabled),
    pointValueSar: 0.25,
    minimumRedemptionPoints: Number(firstRedemption?.pointsCost ?? 0),
    earningRule: firstEarn?.title || `${settings.pointsPerSar} نقطة لكل ريال`,
    redemptionRule: firstRedemption?.title || "لا توجد قاعدة استبدال مفعلة",
    expiryDays: 0,
    policyText: firstRedemption?.description || "تظهر نقاط الولاء حسب القواعد المحفوظة في لوحة التحكم.",
    customerPointsBalance: 320,
    usedPoints: 0,
    earnedLastOperation: 0,
    sampleInvoiceAmount: 0,
  };
}

export function buildLoyaltyDashboardState(input: {
  cafeName: string;
  program?: LoyaltyCardProgram | null;
  cards?: LoyaltyBrandCard[];
  settings: LoyaltySettings;
}): LoyaltyDashboardState {
  const points = buildLoyaltyPointsState(input.settings);
  return {
    card: buildLoyaltyCardDesign({
      cafeName: input.cafeName,
      program: input.program,
      card: input.cards?.[0] ?? null,
      pointsVisible: points.enabled,
    }),
    points,
  };
}
