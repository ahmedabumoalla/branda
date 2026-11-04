"use server";

import { getAdminBrandCustomerAnalytics, getAdminBrandAnalyticsDetail, getAdminBrandAnalyticsCustomer, getAdminBrandAnalyticsExport } from "@/lib/data/brand-customer-analytics";
import type { BrandAnalyticsFilters, BrandAnalyticsReport, BrandAnalyticsDetail, BrandAnalyticsCustomerDetail, BrandAnalyticsExport, BrandAnalyticsResult } from "@/lib/analytics/brand-customer-analytics";

export async function loadBrandCustomerAnalyticsAction(days = 30): Promise<BrandAnalyticsResult<BrandAnalyticsReport>> {
  try { return { ok: true, data: await getAdminBrandCustomerAnalytics(days) }; }
  catch { return { ok: false, message: "تعذر تحميل تحليلات العلامات تحقق من صلاحية دخولك ثم أعد المحاولة" }; }
}

export async function loadBrandAnalyticsDetailAction(filters: BrandAnalyticsFilters): Promise<BrandAnalyticsResult<BrandAnalyticsDetail>> {
  try { return { ok: true, data: await getAdminBrandAnalyticsDetail(filters) }; }
  catch { return { ok: false, message: "تعذر تحميل تفاصيل العلامة أعد المحاولة" }; }
}

export async function loadBrandAnalyticsCustomerAction(brandId: string, customerId: string, page = 1): Promise<BrandAnalyticsResult<BrandAnalyticsCustomerDetail>> {
  try { return { ok: true, data: await getAdminBrandAnalyticsCustomer(brandId, customerId, page) }; }
  catch { return { ok: false, message: "تعذر تحميل سجل العميل أعد المحاولة" }; }
}

export async function loadBrandAnalyticsExportAction(brandId: string, days: number): Promise<BrandAnalyticsResult<BrandAnalyticsExport>> {
  try { return { ok: true, data: await getAdminBrandAnalyticsExport(brandId, days) }; }
  catch { return { ok: false, message: "تعذر تجهيز التقرير الكامل أعد المحاولة لتحميل بيانات العلامة من جديد" }; }
}
