import "server-only";
import { requirePlatformAdmin } from "./cafes";
import { createClient } from "@/lib/supabase/server";
import { customerIntelligenceFilters, customerDetailInput, type CustomerIntelligencePage, type CustomerIntelligenceDetail } from "@/lib/analytics/customer-intelligence";
export async function getCustomerIntelligence(input: unknown): Promise<CustomerIntelligencePage> {
    await requirePlatformAdmin();
    const filters = customerIntelligenceFilters.parse(input);
    const client = await createClient();
    const { data, error } = await client.rpc("get_customer_intelligence", { p_search: filters.search, p_brand: filters.brandId || null, p_segment: filters.segment, p_sort: filters.sort, p_page: filters.page });
    if (error || !data)
        throw new Error("تعذر تحميل بيانات العملاء");
    return data as CustomerIntelligencePage;
}
export async function getCustomerIntelligenceDetail(input: unknown): Promise<CustomerIntelligenceDetail> {
    await requirePlatformAdmin();
    const filters = customerDetailInput.parse(input);
    const client = await createClient();
    const { data, error } = await client.rpc("get_customer_intelligence_detail", { p_customer: filters.customerId, p_page: filters.page, p_kind: filters.kind });
    if (error || !data)
        throw new Error("تعذر تحميل ملف العميل");
    return data as CustomerIntelligenceDetail;
}
