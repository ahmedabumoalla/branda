import { LoyaltyPageClient } from "@/components/dashboard/pages/loyalty-page";
import {
  mockLoyaltyRewards,
  mockLoyaltySettings,
} from "@/lib/mock/loyalty";

export default function LoyaltyPage() {
  return (
    <LoyaltyPageClient
      initialSettings={mockLoyaltySettings}
      initialRewards={mockLoyaltyRewards}
    />
  );
}