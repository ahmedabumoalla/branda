import "server-only";
import { z } from "zod";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { createClient } from "@/lib/supabase/server";
import type { LoyaltyCustomerDetail, LoyaltyCustomerPage } from "@/lib/loyalty/customer-directory-types";

const filterSchema = z.object({ page: z.number().int().min(0).max(100000).default(0), query: z.string().trim().max(100).default("") });

async function directoryContext() {
  const cafe = await requireOwnerCafeContext();
  if (cafe.slug !== "rast" || !["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("Customer directory access denied");
  if (!(await getCafeFeatureCodes(cafe.id)).includes("loyalty")) throw new Error("Loyalty unavailable");
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Authentication required");
  const [profile, brand] = await Promise.all([
    db.from("profiles").select("status").eq("id", user.id).maybeSingle(),
    db.from("cafes").select("status").eq("id", cafe.id).is("deleted_at", null).maybeSingle(),
  ]);
  if (profile.error || brand.error || profile.data?.status !== "active" || !["active", "published"].includes(brand.data?.status ?? "")) throw new Error("Account unavailable");
  return { db, cafeId: cafe.id };
}

export async function getOwnerLoyaltyCustomers(input: unknown = {}): Promise<LoyaltyCustomerPage> {
  const { page, query } = filterSchema.parse(input);
  const { db, cafeId } = await directoryContext();
  const pageSize = 20;
  const fetchPage = (index: number) => {
    let request = db.from("customer_profiles").select("id,full_name,created_at", { count: "exact" }).eq("cafe_id", cafeId);
    if (query) request = request.ilike("full_name", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
    return request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(index * pageSize, (index + 1) * pageSize - 1);
  };
  let result = await fetchPage(page);
  if (result.error) throw new Error("Customer directory unavailable");
  const actualPage = Math.min(page, Math.max(0, Math.ceil((result.count ?? 0) / pageSize) - 1));
  if (actualPage !== page) result = await fetchPage(actualPage);
  if (result.error) throw new Error("Customer directory unavailable");
  return { rows: (result.data ?? []).map(row => ({ id: String(row.id), name: String(row.full_name || "عميل بدون اسم"), joinedAt: String(row.created_at) })), total: result.count ?? 0, page: actualPage, pageSize };
}

/** Contact details are returned for one selected customer after fresh authorization */
export async function getOwnerLoyaltyCustomerDetail(id: unknown): Promise<LoyaltyCustomerDetail> {
  const customerId = z.string().uuid().parse(id);
  const { db, cafeId } = await directoryContext();
  const { data, error } = await db.from("customer_profiles").select("id,full_name,phone")
    .eq("cafe_id", cafeId).eq("id", customerId).maybeSingle();
  if (error || !data) throw new Error("Customer unavailable");
  return { id: String(data.id), name: String(data.full_name || "عميل بدون اسم"), phone: data.phone ? String(data.phone) : null };
}
