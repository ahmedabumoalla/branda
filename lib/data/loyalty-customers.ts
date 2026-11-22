import "server-only";
import { z } from "zod";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { getCafeFeatureCodes } from "@/lib/data/feature-entitlements";
import { createClient } from "@/lib/supabase/server";
import type { LoyaltyCustomerDetail, LoyaltyCustomerPage } from "@/lib/loyalty/customer-directory-types";

const filterSchema = z.object({ page: z.number().int().min(0).max(100000).default(0), query: z.string().trim().max(100).default(""), downloadedOnly: z.boolean().default(false) });

async function directoryContext() {
  const cafe = await requireOwnerCafeContext();
  if (!["owner", "manager", "platform_admin"].includes(cafe.role)) throw new Error("Customer directory access denied");
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
  const { page, query, downloadedOnly } = filterSchema.parse(input);
  const { db, cafeId } = await directoryContext();
  const { data, error } = await db.rpc("loyalty_customer_directory_page", {
    p_cafe: cafeId, p_page: page, p_query: query, p_members_only: downloadedOnly,
  });
  if (error || !data) throw new Error("Customer directory unavailable");
  return data as LoyaltyCustomerPage;
}

/** Contact details are returned for one selected customer after fresh authorization */
export async function getOwnerLoyaltyCustomerDetail(id: unknown, downloadedOnly: unknown = false): Promise<LoyaltyCustomerDetail> {
  const customerId = z.string().uuid().parse(id);
  const downloaded = z.boolean().parse(downloadedOnly);
  const { db, cafeId } = await directoryContext();
  if (downloaded) {
    const { data, error } = await db.rpc("finance_loyalty_customer_detail", { p_cafe: cafeId, p_customer: customerId });
    if (error || !data) throw new Error("Customer unavailable");
    return data as LoyaltyCustomerDetail;
  }
  const [{ data, error }, birthday] = await Promise.all([
    db.from("customer_profiles").select("id,full_name,phone,birth_date").eq("cafe_id", cafeId).eq("id", customerId).maybeSingle(),
    db.rpc("loyalty_birthday_enabled", { p_cafe: cafeId }),
  ]);
  if (error || !data) throw new Error("Customer unavailable");
  return { id: String(data.id), name: String(data.full_name || "عميل بدون اسم"), phone: data.phone ? String(data.phone) : null, birthdayEnabled: birthday.data === true, birthDate: data.birth_date ? String(data.birth_date) : null };
}
