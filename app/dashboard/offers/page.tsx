import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOffers } from "@/lib/data/offers";

export default async function OffersPage() {
  if (!isSupabaseConfigured()) {
    return (
      <OffersPageClient initialOffers={[]} initialProducts={[]} configError="قم بإعداد Supabase في .env.local" />
    );
  }
  try {
    const [offers, menu] = await Promise.all([getOwnerOffers(), getOwnerMenu()]);
    return (
      <OffersPageClient initialOffers={offers} initialProducts={menu.products} />
    );
  } catch {
    return (
      <OffersPageClient initialOffers={[]} initialProducts={[]} configError="تعذر تحميل العروض" />
    );
  }
}
