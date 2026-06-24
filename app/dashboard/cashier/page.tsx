export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { OperationalCashierPageClient } from "@/components/dashboard/pages/operational-cashier-page";
import { isSupabaseConfigured } from "@/lib/barndaksa/env";
import {
  getOwnerLoyaltyCardsDashboard,
  type LoyaltyCardsDashboard,
} from "@/lib/data/loyalty-cards";

const emptyDashboard: LoyaltyCardsDashboard = {
  cafeId: "",
  cafeSlug: "",
  cafeName: "",
  businessCategory: "cafes_coffee",
  program: {
    enabled: true,
    cardTitle: "بطاقة الولاء",
    cardSubtitle: "اجمع الأختام واحصل على مكافأتك",
    purchasesRequired: 7,
    rewardProductId: null,
    rewardProductName: "",
    rewardName: "منتج مجاني",
    stampLabel: "ختم",
    terms: "تطبق الشروط والأحكام الخاصة بالعلامة التجارية",
    cardBackground: "#4A281D",
    cardForeground: "#FCF8F3",
    cardAccent: "#D9A33F",
    appleWalletEnabled: false,
    googleWalletEnabled: false,
  },
  cards: [],
  cashiers: [],
  events: [],
  activities: [],
};

export default async function DashboardCashierPage() {
  if (!isSupabaseConfigured()) {
    return (
      <OperationalCashierPageClient
        initialDashboard={emptyDashboard}
        configError="قم بإعداد Supabase في ملف البيئة"
      />
    );
  }

  try {
    const dashboard = await getOwnerLoyaltyCardsDashboard();
    return <OperationalCashierPageClient initialDashboard={dashboard} />;
  } catch (error) {
    console.error("[DashboardCashierPage]", error);
    return (
      <OperationalCashierPageClient
        initialDashboard={emptyDashboard}
        configError="تعذر تحميل خدمات التشغيل"
      />
    );
  }
}
