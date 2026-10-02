export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OffersPageClient } from "@/components/dashboard/pages/offers-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerMenu } from "@/lib/data/menu";
import { getOwnerOffers } from "@/lib/data/offers";

export default async function OffersPage() {
  if (!isSupabaseConfigured()) {
    return <OffersPageClient initialOffers={[]} initialProducts={[]} configError="قم بإعداد Supabase في ملف البيئة" />;
  }
  const result = await Promise.all([getOwnerOffers(), getOwnerMenu()]).catch(() => null);
  if (!result) {
    return <OffersPageClient initialOffers={[]} initialProducts={[]} configError="تعذر تحميل العروض" />;
  }
  const [offers, menu] = result;
  return <OffersPageClient initialOffers={offers} initialProducts={menu.products} businessCategory={menu.cafe.businessCategory} rastSpotlight={menu.cafe.slug === "rast"} />;
}
