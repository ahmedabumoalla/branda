import type { LoyaltyBrandCard, LoyaltyCardProgram } from "@/lib/data/loyalty-cards";
import type { WalletBranchLocation } from "./branch-locations";

export type WalletMember = {
  card: LoyaltyBrandCard;
  program: LoyaltyCardProgram;
  cafeSlug: string;
  cafeName: string;
  logoUrl: string | null;
  branchId?: string;
  bannerUrl?: string | null;
  /** undefined keeps the legacy single location; [] explicitly clears locations */
  branchLocations?: WalletBranchLocation[];
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
  apple: { status: "accepted" | "skipped" | "failed"; count: number; pending?: boolean; awaitingDevice?: boolean; retryAfterSeconds?: number };
  google: { status: "accepted" | "skipped" | "failed"; count: number; pending?: boolean; retryAfterSeconds?: number };
};
