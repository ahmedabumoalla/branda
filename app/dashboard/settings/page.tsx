export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { SettingsPageClient } from "@/components/dashboard/pages/settings-page";

import { isSupabaseConfigured } from "@/lib/barndaksa/env";

import { getOwnerCafeSettings } from "@/lib/data/settings";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { DashboardFeatureBlockedState } from "@/components/dashboard/feature-blocked-state";



export default async function SettingsPage() {

  if (!isSupabaseConfigured()) {

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "test-cafe",

          cafeName: "العلامة",
          businessCategory: "cafes_coffee",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  const features = await getOwnerFeatureCodes().catch(() => []);
  if (!featureCodesAllow(features, "settings")) {
    return <DashboardFeatureBlockedState title="إعدادات كوفي" />;
  }
  const settings = await getOwnerCafeSettings().catch(() => null);
  if (settings) return <SettingsPageClient initialSettings={settings} />;

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "test-cafe",

          cafeName: "العلامة",
          businessCategory: "cafes_coffee",

          ownerName: "",

          ownerEmail: "",

          ownerPhone: "",

          description: "",

          domainStatus: "غير مربوط",

        }}

        configError="تعذر تحميل الإعدادات — تأكد من تسجيل الدخول"

      />

    );

}
