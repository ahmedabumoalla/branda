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
};

export const mockLoyaltySettings: LoyaltySettings = {
  pointsPerSar: 1,
  welcomePoints: 25,
  enabled: true,
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
  {
    id: "3",
    title: "ترقية حجم المشروب",
    points: 35,
    description: "ترقية حجم المشروب مجانًا عند توفر النقاط.",
    active: false,
  },
];