export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { ThemePageClient } from "@/components/dashboard/pages/theme-page";

import { isSupabaseConfigured } from "@/lib/barndaksa/env";

import { getOwnerLoyalty } from "@/lib/data/loyalty";

import { getOwnerMenu } from "@/lib/data/menu";

import { getOwnerOffers } from "@/lib/data/offers";

import { getOwnerCafeSettings } from "@/lib/data/settings";

import { getOwnerCustomIdentity, getOwnerThemeId } from "@/lib/data/theme";

import { defaultCustomIdentityTheme } from "@/lib/mock/custom-identity-theme";



export default async function ThemePage() {

  if (!isSupabaseConfigured()) {

    return (

      <ThemePageClient

        initialThemeId="brand-identity-custom"

        initialSettings={{

          cafeSlug: "qatrah",

          cafeName: "كوفي",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        initialProducts={[]}

        initialCategories={[]}

        initialOffers={[]}

        initialLoyaltySettings={{

          pointsPerSar: 1,

          welcomePoints: 0,

          enabled: true,

          earnRules: [],

          redemptionRules: [],

        }}

        initialLoyaltyRewards={[]}

        initialCustomIdentity={defaultCustomIdentityTheme()}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [settings, themeId, menu, offers, loyalty, customIdentity] = await Promise.all([

      getOwnerCafeSettings(),

      getOwnerThemeId(),

      getOwnerMenu(),

      getOwnerOffers(),

      getOwnerLoyalty(),

      getOwnerCustomIdentity(),

    ]);



    return (

      <ThemePageClient

        initialThemeId={themeId}

        initialSettings={settings}

        initialProducts={menu.products}

        initialCategories={menu.categories}

        initialOffers={offers}

        initialLoyaltySettings={loyalty.settings}

        initialLoyaltyRewards={loyalty.rewards}

        initialCustomIdentity={customIdentity ?? defaultCustomIdentityTheme()}

      />

    );

  } catch {

    return (

      <ThemePageClient

        initialThemeId="brand-identity-custom"

        initialSettings={{

          cafeSlug: "qatrah",

          cafeName: "كوفي",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        initialProducts={[]}

        initialCategories={[]}

        initialOffers={[]}

        initialLoyaltySettings={{

          pointsPerSar: 1,

          welcomePoints: 0,

          enabled: true,

          earnRules: [],

          redemptionRules: [],

        }}

        initialLoyaltyRewards={[]}

        initialCustomIdentity={defaultCustomIdentityTheme()}

        configError="تعذر تحميل بيانات الثيم"

      />

    );

  }

}

