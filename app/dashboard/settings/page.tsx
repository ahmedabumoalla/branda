export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { SettingsPageClient } from "@/components/dashboard/pages/settings-page";

import { isSupabaseConfigured } from "@/lib/barndaksa/env";

import { getOwnerCafeSettings } from "@/lib/data/settings";



export default async function SettingsPage() {

  if (!isSupabaseConfigured()) {

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "test-cafe",

          cafeName: "كوفي",

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



  try {

    const settings = await getOwnerCafeSettings();

    return <SettingsPageClient initialSettings={settings} />;

  } catch {

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "test-cafe",

          cafeName: "كوفي",

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

}

