export type LoyaltyProgressIcon = "star" | "cup" | "gift" | "heart" | "crown";
export type LoyaltyTextElementId =
  | "brand"
  | "title"
  | "subtitle"
  | "reward"
  | "helper"
  | "pointsLabel"
  | "pointsValue"
  | "pointsValueSar"
  | "barcodeLabel";

export type LoyaltyTextAlign = "right" | "center" | "left";

export type LoyaltyCardTextElement = {
  id: LoyaltyTextElementId;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: LoyaltyTextAlign;
  enabled: boolean;
};

export type LoyaltyLogoPlacement =
  | "top-right"
  | "top-left"
  | "center"
  | "bottom-right"
  | "custom";

export type LoyaltyCardDesign = {
  enabled: boolean;
  brandName: string;
  cardTitle: string;
  subtitle: string;
  rewardTitle: string;
  supportingText: string;
  stampLabel: string;
  terms: string;
  stampsRequired: number;
  completedStamps: number;
  cardBackground: string;
  cardForeground: string;
  cardAccent: string;
  logoPreviewUrl?: string;
  logoRemoveLightBackground: boolean;
  logoBackgroundTolerance: number;
  logoPlacement: LoyaltyLogoPlacement;
  logoSize: number;
  logoOffsetX: number;
  logoOffsetY: number;
  logoX: number;
  logoY: number;
  logoWidth: number;
  logoHeight: number;
  progressIcon: LoyaltyProgressIcon;
  customIconPreviewUrl?: string;
  barcodeVisible: boolean;
  barcodeX: number;
  barcodeY: number;
  barcodeWidth: number;
  barcodeHeight: number;
  qrX: number;
  qrY: number;
  qrWidth: number;
  qrHeight: number;
  pointsBadgeVisible: boolean;
  pointsBadgeX: number;
  pointsBadgeY: number;
  pointsBadgeWidth: number;
  pointsBadgeHeight: number;
  sampleCode: string;
  textElements: Record<LoyaltyTextElementId, LoyaltyCardTextElement>;
};

export type LoyaltyPointsSettings = {
  enabled: boolean;
  pointValueSar: number;
  minimumRedemptionPoints: number;
  earningRule: string;
  redemptionRule: string;
  expiryDays: number;
  policyText: string;
  customerPointsBalance: number;
  usedPoints: number;
  earnedLastOperation: number;
  sampleInvoiceAmount: number;
};

export type LoyaltyDashboardDemoState = {
  card: LoyaltyCardDesign;
  points: LoyaltyPointsSettings;
};

export type LoyaltyDashboardState = LoyaltyDashboardDemoState;
