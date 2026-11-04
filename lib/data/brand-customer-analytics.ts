import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  brandAnalyticsCustomerDetailSchema, brandAnalyticsCustomerInputSchema, brandAnalyticsDaysSchema,
  brandAnalyticsDetailSchema, brandAnalyticsFiltersSchema, brandAnalyticsReportSchema,
  type BrandAnalyticsFilters, type BrandAnalyticsExport,
} from "@/lib/analytics/brand-customer-analytics";

async function requireActivePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Admin access denied");
  const { data: profile, error } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "platform_admin" || profile.status !== "active") throw new Error("Admin access denied");
  return supabase;
}

export async function getAdminBrandCustomerAnalytics(days = 30) {
  const period = brandAnalyticsDaysSchema.parse(days);
  const supabase = await requireActivePlatformAdmin();
  const { data, error } = await supabase.rpc("get_admin_brand_customer_analytics", { p_days: period });
  if (error) throw new Error("Brand customer analytics unavailable");
  const report = brandAnalyticsReportSchema.parse(data);
  if (report.days !== period) throw new Error("Period mismatch");
  return report;
}

async function readDetail(supabase: Awaited<ReturnType<typeof requireActivePlatformAdmin>>, input: BrandAnalyticsFilters, pageSize = 25) {
  const filters = brandAnalyticsFiltersSchema.parse(input);
  const { data, error } = await supabase.rpc("get_admin_brand_analytics_detail", {
    p_brand_id: filters.brandId, p_days: filters.days, p_search: filters.search, p_segment: filters.segment,
    p_sort: filters.sort, p_page: filters.page, p_page_size: pageSize, p_as_of: filters.asOf ?? null,
  });
  if (error) throw new Error("Brand analytics detail unavailable");
  const report = brandAnalyticsDetailSchema.parse(data);
  if (report.brand.id !== filters.brandId || report.days !== filters.days || report.page !== filters.page || report.pageSize !== pageSize
      || (filters.asOf && Date.parse(report.generatedAt) !== Date.parse(filters.asOf))) throw new Error("Brand analytics snapshot mismatch");
  return report;
}

export async function getAdminBrandAnalyticsDetail(input: BrandAnalyticsFilters) {
  return readDetail(await requireActivePlatformAdmin(), input);
}

export async function getAdminBrandAnalyticsCustomer(brandId: string, customerId: string, page = 1) {
  const input = brandAnalyticsCustomerInputSchema.parse({ brandId, customerId, page });
  const supabase = await requireActivePlatformAdmin();
  const { data, error } = await supabase.rpc("get_admin_brand_analytics_customer", {
    p_brand_id: input.brandId, p_customer_id: input.customerId, p_page: input.page,
  });
  if (error) throw new Error("Brand analytics customer unavailable");
  const report = brandAnalyticsCustomerDetailSchema.parse(data);
  if (report.customer.id !== input.customerId || report.page !== input.page) throw new Error("Customer mismatch");
  return report;
}

export async function getAdminBrandAnalyticsExport(brandId: string, days: number): Promise<BrandAnalyticsExport> {
  const filters = brandAnalyticsFiltersSchema.parse({ brandId, days, sort: "name" });
  const supabase = await requireActivePlatformAdmin();
  const first = await readDetail(supabase, filters, 100);
  const { data, error } = await supabase.rpc("get_admin_brand_customer_analytics", { p_days: filters.days, p_as_of: first.generatedAt });
  if (error) throw new Error("Export metadata unavailable");
  const overview = brandAnalyticsReportSchema.parse(data);
  const customers = [...first.customers];
  const pages = Math.ceil(first.total / 100);
  // Bound each concurrent batch and refuse an inconsistent snapshot instead of exporting partial customer data.
  for (let page = 2; page <= pages; page += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, pages - page + 1) }, (_, offset) =>
      readDetail(supabase, { ...filters, page: page + offset, asOf: first.generatedAt }, 100)));
    for (const part of batch) {
      if (part.total !== first.total) throw new Error("Export changed while loading");
      customers.push(...part.customers);
    }
  }
  if (customers.length !== first.total || new Set(customers.map(customer => customer.id)).size !== first.total
      || first.brand.registeredCustomers !== first.total || Date.parse(overview.generatedAt) !== Date.parse(first.generatedAt)) {
    throw new Error("Incomplete brand export");
  }
  return { report: first, customers, generatedAt: first.generatedAt,
    recordingStartedAt: overview.recordingStartedAt, walletRecordingStartedAt: overview.walletRecordingStartedAt };
}
