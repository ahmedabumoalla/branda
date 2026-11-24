import "server-only";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getOwnerFeatureCodes } from "@/lib/data/feature-entitlements";
import { featureCodesAllow } from "@/lib/platform/feature-gates";
import { createClient } from "@/lib/supabase/server";
import { loyaltyBranchReportPageSchema, parseBranchReportFilters } from "@/lib/loyalty/branch-report-validation";
import type { BranchReportFilters, LoyaltyBranchExportSnapshot, LoyaltyBranchReportPage } from "@/lib/loyalty/branch-report-types";

async function reportContext() {
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("Forbidden: branch report access");
  if (!featureCodesAllow(await getOwnerFeatureCodes(), "loyalty")) throw new Error("Forbidden: loyalty unavailable");
  return { cafe, client: await createClient() };
}
async function readReport(context: Awaited<ReturnType<typeof reportContext>>, input: ReturnType<typeof parseBranchReportFilters>, pageSize: number, cutoff?: string) {
  const { filters, from, to } = input;
  const { data, error } = await context.client.rpc("get_owner_loyalty_branch_report", {
    p_cafe_id: context.cafe.id, p_from: from, p_to: cutoff ?? to,
    p_branch_id: filters.branchId && filters.branchId !== "unassigned" ? filters.branchId : null,
    p_unassigned: filters.branchId === "unassigned", p_search: filters.search, p_page: filters.page, p_page_size: pageSize,
  });
  if (error) throw new Error("Branch report unavailable");
  return loyaltyBranchReportPageSchema.parse(data);
}
export async function getOwnerLoyaltyBranchReport(input: BranchReportFilters): Promise<LoyaltyBranchReportPage> {
  const parsed = parseBranchReportFilters(input);
  return readReport(await reportContext(), parsed, 25);
}
export async function getOwnerLoyaltyBranchExport(input: BranchReportFilters): Promise<LoyaltyBranchExportSnapshot> {
  const parsed = parseBranchReportFilters({ ...input, page: 1 });
  const context = await reportContext();
  const generatedAt = new Date().toISOString();
  const cutoff = parsed.to && parsed.to < generatedAt ? parsed.to : generatedAt;
  const first = await readReport(context, parsed, 500, cutoff);
  const customers = [...first.customers];
  const seen = new Set(customers.map(customer => customer.cardId));
  if (seen.size !== customers.length) throw new Error("Branch export duplicate cards");
  for (let page = 2; customers.length < first.total; page++) {
    const next = await readReport(context, { ...parsed, filters: { ...parsed.filters, page } }, 500, cutoff);
    if (next.total !== first.total || next.page !== page || !next.customers.length) throw new Error("Branch report changed during export");
    for (const customer of next.customers) {
      if (seen.has(customer.cardId)) throw new Error("Branch report changed during export");
      seen.add(customer.cardId); customers.push(customer);
    }
  }
  if (customers.length !== first.total) throw new Error("Incomplete branch export");
  return { brandName: context.cafe.name, generatedAt, from: parsed.filters.from, to: parsed.filters.to,
    summary: first.summary, branches: first.branches, staff: first.staff, customers };
}
