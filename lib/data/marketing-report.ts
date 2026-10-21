import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminCampaignReportSchema } from "@/lib/analytics/marketing-report";
import { reportPeriodSchema, type ReportPeriod } from "@/lib/analytics/operations-report";

export class CampaignReportAccessError extends Error {}
export const campaignHistoryInputSchema = z.object({ brandId: z.uuid(), page: z.coerce.number().int().min(0).max(100000).default(0), from: z.string().default(""), to: z.string().default("") }).strict()
  .refine(value => reportPeriodSchema.safeParse({ from: value.from, to: value.to }).success);

export async function getAdminCampaignReport(period: ReportPeriod, brandId?: string, page = 0) {
  const filters = reportPeriodSchema.parse(period);
  if (brandId !== undefined) campaignHistoryInputSchema.parse({ ...filters, brandId, page });
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new CampaignReportAccessError("Admin access denied");
  const { data: profile, error } = await db.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "platform_admin" || profile.status !== "active") throw new CampaignReportAccessError("Admin access denied");
  const result = await db.rpc("get_admin_marketing_campaign_report", { p_from: filters.from || null, p_to: filters.to || null, p_cafe: brandId ?? null, p_page: page });
  if (result.error) throw new Error("Campaign report unavailable");
  const parsed = adminCampaignReportSchema.parse(result.data);
  if (parsed.from !== (filters.from || null) || parsed.to !== (filters.to || null) || (brandId && (!parsed.history || parsed.history.page !== page))) throw new Error("Campaign report scope mismatch");
  return parsed;
}
