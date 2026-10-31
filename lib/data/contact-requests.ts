import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import { contactRequestSchema, contactStatusSchema, type ContactRequest, type ContactRequestInput } from "@/lib/platform/contact-requests";
import { z } from "zod";

export async function submitHomeContactRequest(input: ContactRequestInput) {
  const parsed = contactRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, reason: "invalid" };
  const value = parsed.data;
  const { error } = await createAdminClient().rpc("submit_home_contact_request", {
    p_id: value.requestId, p_full_name: value.fullName, p_phone: value.phone,
    p_business: value.business, p_business_type: value.businessType, p_selected_plan: value.selectedPlan,
  });
  if (error) {
    return { ok: false as const, reason: error.message === "Contact rate limit" ? "rate" : "unavailable" };
  }
  return { ok: true as const };
}

export async function getAdminContactRequests(page = 1) {
  await requirePlatformAdmin();
  const safePage = Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
  const { data, error, count } = await createAdminClient().from("platform_contact_requests")
    .select("id,full_name,phone,email,business_name,business_type,selected_plan,message,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).order("id").range((safePage - 1) * 30, safePage * 30 - 1);
  if (error) throw new Error("تعذر تحميل طلبات التواصل");
  return { count: count ?? 0, page: safePage, requests: (data ?? []).map(row => ({
    id: String(row.id), fullName: String(row.full_name), phone: row.phone as string | null,
    email: row.email as string | null, business: row.business_name as string | null,
    businessType: row.business_type as string | null, selectedPlan: row.selected_plan as string | null,
    message: String(row.message), status: contactStatusSchema.parse(row.status), createdAt: String(row.created_at),
  } satisfies ContactRequest)) };
}

export async function updateContactRequestStatus(id: string, status: string) {
  await requirePlatformAdmin();
  const parsedId = z.string().uuid().parse(id);
  const parsedStatus = contactStatusSchema.parse(status);
  const { data, error } = await createAdminClient().from("platform_contact_requests")
    .update({ status: parsedStatus }).eq("id", parsedId).select("id").single();
  if (error || !data) throw new Error("تعذر تحديث حالة الطلب");
}
