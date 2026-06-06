import { SettingsPageClient } from "@/components/dashboard/pages/settings-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getOwnerCafeSettings } from "@/lib/data/settings";



export default async function SettingsPage() {

  if (!isSupabaseConfigured()) {

    return (

      <SettingsPageClient

        initialSettings={{

          cafeSlug: "qatrah",

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

          cafeSlug: "qatrah",

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

