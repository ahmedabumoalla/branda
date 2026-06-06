import { AdminOptionsPage } from "@/components/admin/pages/admin-options-page";

import { isSupabaseConfigured } from "@/lib/branda/env";

import { getPlatformPlans } from "@/lib/data/admin";

import { getPlatformSettings } from "@/lib/data/platform-settings";

import { mockPlatformOptions, mockPlatformPlans } from "@/lib/platform/admin-data";



export default async function AdminOptionsRoutePage() {

  if (!isSupabaseConfigured()) {

    return (

      <AdminOptionsPage

        initialOptions={mockPlatformOptions}

        initialPlans={mockPlatformPlans}

        configError="قم بإعداد Supabase في .env.local"

      />

    );

  }



  try {

    const [plans, settings] = await Promise.all([getPlatformPlans(), getPlatformSettings()]);

    return (

      <AdminOptionsPage

        initialOptions={settings ?? mockPlatformOptions}

        initialPlans={plans.length ? plans : mockPlatformPlans}

      />

    );

  } catch {

    return (

      <AdminOptionsPage

        initialOptions={mockPlatformOptions}

        initialPlans={mockPlatformPlans}

        configError="تعذر تحميل خيارات المنصة"

      />

    );

  }

}

