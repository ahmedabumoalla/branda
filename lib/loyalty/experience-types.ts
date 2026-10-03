export type LoyaltyExperienceSettings = {
  rewardKind?: "product" | "discount" | "custom";
  rewardDiscountPercent?: number | null;
  rewardValidityDays: number;
  nearbyMessage: string;
  latitude: number | null;
  longitude: number | null;
};

export type LoyaltyExperienceInput = LoyaltyExperienceSettings & { mapsUrl?: string };

export const defaultLoyaltyExperience: LoyaltyExperienceSettings = {
  rewardKind: "custom",
  rewardDiscountPercent: null,
  rewardValidityDays: 30,
  nearbyMessage: "قريب منّا؟ خذ لك لحظة قهوة، يسعدنا نشوفك.",
  latitude: null,
  longitude: null,
};

export type LoyaltyIdentity = { name: string; slug: string; logoUrl: string | null };
export type LoyaltyMemberCard = {
  customerName: string;
  cardCode: string;
  stamps: number;
  required: number;
  rewardName: string;
};
