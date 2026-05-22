import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { mockOffers } from "@/lib/mock/offers";

export default function OffersPage() {
  return <OffersPageClient initialOffers={mockOffers} />;
}