export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { GiftCardsWalletPage } from "@/components/dashboard/pages/gift-cards-wallet-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import { getOwnerGiftCardsWalletDashboard } from "@/lib/data/gift-cards-wallet";

export default async function DashboardGiftCardsWalletPage() {
  if (!isSupabaseConfigured()) {
    return <GiftCardsWalletPage data={null} configError="قم بإعداد Supabase في .env.local" />;
  }

  try {
    const data = await getOwnerGiftCardsWalletDashboard();
    return <GiftCardsWalletPage data={data} />;
  } catch (error) {
    console.error("[DashboardGiftCardsWalletPage]", error);
    return <GiftCardsWalletPage data={null} configError="تعذر تحميل بطاقات الهدايا والرصيد" />;
  }
}
