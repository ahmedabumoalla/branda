import { LoyaltyCardsPageClient } from "@/components/dashboard/pages/loyalty-cards-page";
import { isSupabaseConfigured } from "@/lib/branda/env";
import { getOwnerLoyaltyCardsDashboard, type LoyaltyCardsDashboard } from "@/lib/data/loyalty-cards";
import { getOwnerMenu } from "@/lib/data/menu";

const emptyDashboard: LoyaltyCardsDashboard = {
  cafeId: "",
  cafeSlug: "",
  cafeName: "",
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

export default async function LoyaltyCardsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <LoyaltyCardsPageClient
        initialDashboard={emptyDashboard}
        products={[]}
        configError="قم بإعداد Supabase في ملف البيئة"
      />
    );
  }

  try {
    const [dashboard, menu] = await Promise.all([
      getOwnerLoyaltyCardsDashboard(),
      getOwnerMenu(),
    ]);

    return <LoyaltyCardsPageClient initialDashboard={dashboard} products={menu.products} />;
  } catch (error) {
    console.error("[LoyaltyCardsPage]", error);
    return (
      <LoyaltyCardsPageClient
        initialDashboard={emptyDashboard}
        products={[]}
        configError="تعذر تحميل بطاقات الولاء"
      />
    );
  }
}
