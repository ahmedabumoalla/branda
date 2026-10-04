import "server-only";
import { createClient } from "@/lib/supabase/server";
import { brandCustomerDetailInputSchema, brandCustomerDetailSchema, brandCustomersPageSchema, parseBrandCustomerFilters } from "@/lib/admin/brand-customer-validation";
import type { BrandCustomerDetail, BrandCustomerFilters, BrandCustomersPage } from "@/lib/admin/brand-customer-types";

async function requireActivePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("Admin access denied");
  const { data: profile, error } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "platform_admin" || profile.status !== "active") throw new Error("Admin access denied");
  return supabase;
}

export async function getAdminBrandCustomers(input: BrandCustomerFilters = {}): Promise<BrandCustomersPage> {
  const supabase = await requireActivePlatformAdmin();
  const filters = parseBrandCustomerFilters(input);
  const { data, error } = await supabase.rpc("get_admin_brand_customers", {
    p_search: filters.search, p_brand_id: filters.brandId || null, p_segment: filters.segment,
    p_sort: filters.sort, p_page: filters.page, p_page_size: 25,
  });
  if (error) throw new Error("Brand customers unavailable");
  return brandCustomersPageSchema.parse(data);
}

export async function getAdminBrandCustomerDetail(customerId: string, page = 1): Promise<BrandCustomerDetail> {
  const supabase = await requireActivePlatformAdmin();
  const input = brandCustomerDetailInputSchema.parse({ customerId, page });
  const { data, error } = await supabase.rpc("get_admin_brand_customer_detail", {
    p_customer_id: input.customerId, p_page: input.page, p_page_size: 25,
  });
  if (error) throw new Error("Brand customer detail unavailable");
  return brandCustomerDetailSchema.parse(data);
}
