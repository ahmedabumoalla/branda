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
  cardSubtitle: "اجمع الأختام واحصل على مكافأتك",
  purchasesRequired: 7,
  rewardName: "منتج مجاني",
  stampLabel: "ختم",
  terms: "",
  cardBackground: "#4A281D",
  cardForeground: "#FCF8F3",
  cardAccent: "#D9A33F",
};

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
    color: "#FCF8F3",
    align: "right" as const,
    enabled,
  };
}

function sanitizeDesign(input: LoyaltyCardDesign, patch: Partial<LoyaltyCardDesign>): LoyaltyCardDesign {
  const next = { ...input, ...patch };
  return {
    ...next,
    stampsRequired: Math.max(1, Math.min(100, Number(next.stampsRequired || 7))),
    completedStamps: Math.max(0, Math.min(Number(next.stampsRequired || 7), Number(next.completedStamps || 0))),
    textElements: {
      ...input.textElements,
      ...(next.textElements ?? {}),
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
    enabled: Boolean(program.enabled ?? true),
    brandName: input.cafeName,
    cardTitle: String(program.cardTitle || fallbackProgram.cardTitle),
    subtitle: String(program.cardSubtitle || fallbackProgram.cardSubtitle),
    rewardTitle: String(program.rewardName || fallbackProgram.rewardName),
    supportingText: "اعرض البطاقة عند الكاشير",
    stampLabel: String(program.stampLabel || fallbackProgram.stampLabel),
    terms: String(program.terms || ""),
    stampsRequired: required,
    completedStamps: completed,
    cardBackground: String(program.cardBackground || fallbackProgram.cardBackground),
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
    barcodeX: 8,
    barcodeY: 73,
    barcodeWidth: 34,
    barcodeHeight: 15,
    qrX: 8,
    qrY: 8,
    qrWidth: 18,
    qrHeight: 18,
    pointsBadgeVisible: Boolean(input.pointsVisible),
    pointsBadgeX: 8,
    pointsBadgeY: 62,
    pointsBadgeWidth: 24,
    pointsBadgeHeight: 10,
    sampleCode: code || "LOYALTY-CARD",
    textElements: {
      brand: textElement("brand", input.cafeName, 42, 10, 28, 8, 22),
      title: textElement("title", String(program.cardTitle || fallbackProgram.cardTitle), 42, 20, 34, 10, 34),
      subtitle: textElement("subtitle", String(program.cardSubtitle || fallbackProgram.cardSubtitle), 42, 31, 34, 8, 20),
      reward: textElement("reward", String(program.rewardName || fallbackProgram.rewardName), 42, 42, 34, 8, 18),
      helper: textElement("helper", "{{code}}", 44, 73, 28, 8, 18),
      pointsLabel: textElement("pointsLabel", "النقاط", 8, 56, 22, 5, 12, Boolean(input.pointsVisible)),
      pointsValue: textElement("pointsValue", "{{points}}", 8, 61, 22, 7, 20, Boolean(input.pointsVisible)),
      pointsValueSar: textElement("pointsValueSar", "{{value}}", 8, 68, 22, 5, 11, Boolean(input.pointsVisible)),
      barcodeLabel: textElement("barcodeLabel", "رمز البطاقة", 8, 68, 34, 5, 14),
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
    pointValueSar: 0,
    minimumRedemptionPoints: Number(firstRedemption?.pointsCost ?? 0),
    earningRule: firstEarn?.title || `${settings.pointsPerSar} نقطة لكل ريال`,
    redemptionRule: firstRedemption?.title || "لا توجد قاعدة استبدال مفعلة",
    expiryDays: 0,
    policyText: firstRedemption?.description || "تظهر نقاط الولاء حسب القواعد المحفوظة في لوحة التحكم.",
    customerPointsBalance: 0,
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
