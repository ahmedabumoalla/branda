import { createClient } from "@/lib/supabase/server";

import { requirePlatformAdmin } from "@/lib/data/cafes";

import type { mockPlatformOptions } from "@/lib/platform/admin-data";



export type PlatformSettings = typeof mockPlatformOptions;



function mapRow(row: Record<string, unknown>): PlatformSettings {

  return {

    allowCafeSignup: row.allow_cafe_signup as boolean,

    requireCafeApproval: row.require_cafe_approval as boolean,

    platformCommissionPercent: Number(row.platform_commission_percent),

    supportEmail: row.support_email as string,

    defaultPlanId: row.default_plan_id as string,

  };

}



export async function getPlatformSettings(): Promise<PlatformSettings | null> {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase

    .from("platform_settings")

    .select("*")

    .eq("id", "default")

    .maybeSingle();



  if (error) throw error;

  return data ? mapRow(data) : null;

}



export async function savePlatformSettings(settings: PlatformSettings) {

  await requirePlatformAdmin();

  const supabase = await createClient();

  const { error } = await supabase

    .from("platform_settings")

    .update({

      allow_cafe_signup: settings.allowCafeSignup,

      require_cafe_approval: settings.requireCafeApproval,

      platform_commission_percent: settings.platformCommissionPercent,

      support_email: settings.supportEmail,

      default_plan_id: settings.defaultPlanId,

    })

    .eq("id", "default");



  if (error) throw error;

}

