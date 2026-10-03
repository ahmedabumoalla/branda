import type { LoyaltyBrandCard, LoyaltyCardProgram } from "@/lib/data/loyalty-cards";

export type WalletMember = {
  card: LoyaltyBrandCard;
  program: LoyaltyCardProgram;
  cafeSlug: string;
  cafeName: string;
  logoUrl: string | null;
  experience: {
    rewardValidityDays: number;
    nearbyMessage: string;
    latitude: number | null;
    longitude: number | null;
    offerTitle?: string;
    offerBody?: string;
  };
};

export type WalletDeliveryResult = {
  apple: { status: "accepted" | "skipped" | "failed"; count: number; pending?: boolean; retryAfterSeconds?: number };
  google: { status: "accepted" | "skipped" | "failed"; count: number; pending?: boolean; retryAfterSeconds?: number };
};
