"use server";

import { getAdminBrandCustomerDetail, getAdminBrandCustomers } from "@/lib/data/brand-customers";
import type { BrandCustomerDetail, BrandCustomerFilters, BrandCustomerResult, BrandCustomersPage } from "@/lib/admin/brand-customer-types";

export async function loadBrandCustomersAction(filters: BrandCustomerFilters): Promise<BrandCustomerResult<BrandCustomersPage>> {
  try { return { ok: true, data: await getAdminBrandCustomers(filters) }; }
  catch { return { ok: false, message: "تعذر تحميل عملاء العلامات التجارية تحقق من صلاحية دخولك ثم أعد المحاولة" }; }
}

export async function loadBrandCustomerDetailAction(customerId: string, page = 1): Promise<BrandCustomerResult<BrandCustomerDetail>> {
  try { return { ok: true, data: await getAdminBrandCustomerDetail(customerId, page) }; }
  catch { return { ok: false, message: "تعذر تحميل تفاصيل العميل وسجل نشاطه أعد المحاولة" }; }
}
