export type LoyaltyRuleType =
  | "purchase_per_sar"
  | "product_bonus"
  | "first_order_bonus"
  | "experience_bonus";

export type LoyaltyRedemptionType =
  | "fixed_discount"
  | "percent_discount"
  | "free_product"
  | "specific_product"
  | "special_reward";

export type LoyaltyEarnRule = {
  id: string;
  type: LoyaltyRuleType;
  title: string;
  enabled: boolean;
  pointsPerSar?: number;
  productId?: string;
  bonusPoints?: number;
  requiresApproval?: boolean;
};

export type LoyaltyRedemptionRule = {
  id: string;
  type: LoyaltyRedemptionType;
  title: string;
  enabled: boolean;
  pointsCost: number;
  discountAmount?: number;
  discountPercent?: number;
  productId?: string;
  description?: string;
};

export type LoyaltyReward = {
  id: string;
  title: string;
  points: number;
  description: string;
  active: boolean;
};

export type LoyaltySettings = {
  pointsPerSar: number;
  welcomePoints: number;
  enabled: boolean;
  earnRules: LoyaltyEarnRule[];
  redemptionRules: LoyaltyRedemptionRule[];
};

export const LOYALTY_SETTINGS_KEY = "branda_qatrah_loyalty_settings";
export const LOYALTY_REWARDS_KEY = "branda_qatrah_loyalty_rewards";

export const mockLoyaltySettings: LoyaltySettings = {
  pointsPerSar: 1,
  welcomePoints: 25,
  enabled: true,
  earnRules: [
    {
      id: "earn_sar",
      type: "purchase_per_sar",
      title: "كل 1 ر.س = 1 نقطة",
      enabled: true,
      pointsPerSar: 1,
    },
    {
      id: "earn_first",
      type: "first_order_bonus",
      title: "مكافأة أول طلب",
      enabled: true,
      bonusPoints: 50,
    },
    {
      id: "earn_experience",
      type: "experience_bonus",
      title: "مكافأة وثّق تجربتك",
      enabled: true,
      bonusPoints: 0,
      requiresApproval: true,
    },
  ],
  redemptionRules: [
    {
      id: "red_10",
      type: "percent_discount",
      title: "خصم 10%",
      enabled: true,
      pointsCost: 50,
      discountPercent: 10,
      description: "يستبدل العميل 50 نقطة ويحصل على خصم 10%.",
    },
    {
      id: "red_drink",
      type: "free_product",
      title: "مشروب مجاني",
      enabled: true,
      pointsCost: 100,
      description: "يستبدل العميل 100 نقطة ويحصل على مشروب مجاني.",
    },
  ],
};

export const mockLoyaltyRewards: LoyaltyReward[] = [
  {
    id: "1",
    title: "خصم 10%",
    points: 50,
    description: "يستبدل العميل 50 نقطة ويحصل على خصم 10%.",
    active: true,
  },
  {
    id: "2",
    title: "مشروب مجاني",
    points: 100,
    description: "يستبدل العميل 100 نقطة ويحصل على مشروب مجاني.",
    active: true,
  },
];
