import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { operationsReportSchema, reportPeriodSchema, type OperationsReport, type ReportPeriod } from "@/lib/analytics/operations-report";
import { getEffectiveBrandFeatureCodes, type BrandFeatureOverride } from "@/lib/platform/feature-access";
import { getPlatformFeatureDefinition } from "@/lib/platform/feature-registry";

const rawReportSchema = operationsReportSchema.extend({
  brands: z.array(operationsReportSchema.shape.brands.element.omit({ features: true }).extend({
    planFeatures: z.unknown(),
    featureOverrides: z.array(z.object({ featureId: z.string(), enabled: z.boolean() })),
  })),
});
function featureList(input: unknown): string[] {
  if (Array.isArray(input)) return input.filter((value): value is string => typeof value === "string");
  if (typeof input === "string") {
    try { return featureList(JSON.parse(input)); } catch { return input.split(",").map(value => value.trim()).filter(Boolean); }
  }
  return [];
}

export async function getAdminOperationsReport(input: ReportPeriod = { from: "", to: "" }): Promise<OperationsReport> {
  const filters = reportPeriodSchema.parse(input);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Admin access denied");
  const { data: profile, error } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "platform_admin" || profile.status !== "active") throw new Error("Admin access denied");
  const result = await supabase.rpc("get_admin_operations_report", { p_from: filters.from || null, p_to: filters.to || null });
  if (result.error) throw new Error("Operations report unavailable");
  const raw = rawReportSchema.parse(result.data);
  if (raw.from !== (filters.from || null) || raw.to !== (filters.to || null)) throw new Error("Report period mismatch");
  return operationsReportSchema.parse({ ...raw, brands: raw.brands.map(({ planFeatures, featureOverrides, ...brand }) => {
    const overrides = featureOverrides.filter(item => getPlatformFeatureDefinition(item.featureId)) as BrandFeatureOverride[];
    const features: string[] = getEffectiveBrandFeatureCodes(brand.subscribed ? featureList(planFeatures) : [], overrides);
    // Standalone-menu publication is independent of package subscription.
    if (featureOverrides.some(item => item.featureId === "standalone_menu" && item.enabled)) features.push("standalone_menu");
    return { ...brand, features };
  }) });
}
