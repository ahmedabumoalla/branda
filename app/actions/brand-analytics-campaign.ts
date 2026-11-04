"use server";

import { BrandAnalyticsCampaignError, getBrandAnalyticsCampaignAudience, createBrandAnalyticsCampaign } from "@/lib/data/brand-analytics-campaign";
import type { BrandAnalyticsCampaignAudience, BrandAnalyticsCampaignAudienceInput, BrandAnalyticsCampaignCreated, BrandAnalyticsCampaignInput, BrandAnalyticsCampaignResult } from "@/lib/analytics/brand-analytics-campaign";

export async function loadBrandAnalyticsCampaignAudienceAction(input: BrandAnalyticsCampaignAudienceInput): Promise<BrandAnalyticsCampaignResult<BrandAnalyticsCampaignAudience>> {
  try { return { ok: true, data: await getBrandAnalyticsCampaignAudience(input) }; }
  catch (error) {
    if (error instanceof BrandAnalyticsCampaignError) return { ok: false, message: error.message, code: error.code };
    return { ok: false, message: "تعذر تحميل عملاء الحملة أعد المحاولة", code: "unavailable" };
  }
}

export async function createBrandAnalyticsCampaignAction(input: BrandAnalyticsCampaignInput): Promise<BrandAnalyticsCampaignResult<BrandAnalyticsCampaignCreated>> {
  try { return { ok: true, data: await createBrandAnalyticsCampaign(input) }; }
  catch (error) {
    if (error instanceof BrandAnalyticsCampaignError) return { ok: false, message: error.message, code: error.code };
    return { ok: false, message: "لم نتأكد من نتيجة الطلب أعد المحاولة بنفس البيانات أو راجع سجل الحملات", code: "uncertain" };
  }
}
