import "server-only";
import { createClient } from "@/lib/supabase/server";
import { brandAnalyticsInputSchema, brandAnalyticsSchema, type BrandAnalyticsInput } from "@/lib/analytics/brand-analytics";

export async function getAdminBrandAnalytics(input: BrandAnalyticsInput) {
  const filters = brandAnalyticsInputSchema.parse(input);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Admin access denied");
  const { data: profile, error } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "platform_admin" || profile.status !== "active") throw new Error("Admin access denied");
  const result = await supabase.rpc("get_admin_brand_analytics", {
    p_cafe_id: filters.brandId, p_from: filters.from || null, p_to: filters.to || null,
  });
  if (result.error) throw new Error("Brand analytics unavailable");
  const data = brandAnalyticsSchema.parse(result.data);
  if (data.brandId !== filters.brandId) throw new Error("Brand mismatch");
  return data;
}
