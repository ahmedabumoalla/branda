export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOffers } from "@/lib/data/offers";
import { getOwnerExperienceData } from "@/lib/data/experience";
import { getOwnerReservationServices } from "@/lib/data/platform-upgrade";

export default async function OffersPage() {
  if (!isSupabaseConfigured()) {
    return (
      <OffersPageClient initialOffers={[]} initialProducts={[]} configError="قم بإعداد Supabase في .env.local" />
    );
  }
  try {
    const [offers, menu, services, experience] = await Promise.all([
      getOwnerOffers(),
      getOwnerMenu(),
      getOwnerReservationServices(),
      getOwnerExperienceData(),
    ]);
    return (
      <OffersPageClient
        initialOffers={offers}
        initialProducts={menu.products}
        initialReservationServices={services}
        initialExperienceCampaigns={experience.campaigns}
      />
    );
  } catch {
    return (
      <OffersPageClient initialOffers={[]} initialProducts={[]} configError="تعذر تحميل العروض" />
    );
  }
}
