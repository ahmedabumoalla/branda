import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";
import type {
  PlatformCafe,
  PlatformCustomer,
  PlatformOperation,
  PlatformPlan,
  PlanDurationUnit,
} from "@/lib/platform/admin-data";
import type { SubscriptionPaymentRequest } from "@/lib/platform/subscription";

const planSchema = z.object({
  id: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(1).max(80),
  priceMonthly: z.number().nonnegative().max(1000000),
  offerEnabled: z.boolean(),
  offerPrice: z.number().nonnegative().max(1000000).optional(),
  durationUnit: z.enum(["day", "month", "year"]),
  durationCount: z.number().int().positive().max(120),
  description: z.string().trim().max(500),
  active: z.boolean(),
  isDefault: z.boolean(),
  features: z.array(z.string()).max(20),
});

function mapDbPlan(row: Record<string, unknown>, defaultPlanId?: string): PlatformPlan {
  return {
    id: String(row.id),
    name: String(row.name),
    priceMonthly: Number(row.price_sar ?? 0),
    offerEnabled: Boolean(row.offer_enabled),
    offerPrice: row.offer_price_sar == null ? undefined : Number(row.offer_price_sar),
    durationUnit: String(row.duration_unit ?? "month") as PlanDurationUnit,
    durationCount: Number(row.duration_count ?? 1),
    description: String(row.description ?? ""),
    active: Boolean(row.active),
    isDefault: String(row.id) === defaultPlanId,
    features: Array.isArray(row.features) ? (row.features as PlatformPlan["features"]) : [],
  };
}

export async function getPlatformPlans(): Promise<PlatformPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("platform_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((row) => mapDbPlan(row));
}

export async function getAdminPlatformPlans(): Promise<PlatformPlan[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();

  const [{ data: plans, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("platform_plans").select("*").order("sort_order"),
    supabase.from("platform_settings").select("default_plan_id").eq("id", "default").single(),
  ]);

  if (error) throw error;
  if (settingsError) throw settingsError;

  return (plans ?? []).map((row) => mapDbPlan(row, String(settings.default_plan_id)));
}

export async function getOwnerActivePlanId(): Promise<string> {
  const { requireOwnerCafeContext } = await import("@/lib/data/cafes");
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("cafe_id", cafe.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return String(data?.plan_id ?? "");
}

export async function savePlatformPlans(plans: PlatformPlan[]) {
  await requirePlatformAdmin();

  const parsed = z.array(planSchema).min(1).max(30).parse(plans);
  const defaults = parsed.filter((plan) => plan.isDefault && plan.active);
  if (defaults.length !== 1) {
    throw new Error("حدد باقة أساسية مفعلة واحدة فقط");
  }

  const supabase = await createClient();

  for (const plan of parsed) {
    const { error } = await supabase.rpc("admin_save_platform_plan", {
      p_id: plan.id,
      p_name: plan.name,
      p_price_sar: plan.priceMonthly,
      p_offer_enabled: plan.offerEnabled,
      p_offer_price_sar: plan.offerEnabled ? (plan.offerPrice ?? null) : null,
      p_duration_unit: plan.durationUnit,
      p_duration_count: plan.durationCount,
      p_description: plan.description,
      p_features: plan.features,
      p_active: plan.active,
      p_is_default: plan.isDefault,
    });
    if (error) throw error;
  }
}

function mapRequest(row: Record<string, unknown>): SubscriptionPaymentRequest {
  const cafe = row.cafes as { name?: string } | null;
  const branch = row.branches as { name?: string } | null;
  return {
    id: String(row.id),
    cafeId: String(row.cafe_id),
    cafeName: cafe?.name ?? "",
    planId: String(row.plan_id),
    planName: String(row.plan_name),
    baseAmount: Number(row.base_amount_sar),
    amount: Number(row.amount_sar),
    durationUnit: String(row.duration_unit) as PlanDurationUnit,
    durationCount: Number(row.duration_count),
    paymentMethod: row.payment_method as SubscriptionPaymentRequest["paymentMethod"],
    branchId: row.branch_id ? String(row.branch_id) : undefined,
    branchName: branch?.name,
    receiptStoragePath: row.receipt_storage_path ? String(row.receipt_storage_path) : undefined,
    status: row.status as SubscriptionPaymentRequest["status"],
    createdAt: String(row.created_at),
    adminResponse: row.admin_response ? String(row.admin_response) : undefined,
  };
}

export async function getAdminSubscriptionRequests(): Promise<SubscriptionPaymentRequest[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_payment_requests")
    .select("*, cafes(name), branches(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []).map(mapRequest);
}

export async function approveSubscriptionRequest(requestId: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_approve_subscription_request", {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function rejectSubscriptionRequest(requestId: string, response: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_subscription_request", {
    p_request_id: requestId,
    p_response: response.trim() || "تم رفض طلب الاشتراك",
  });
  if (error) throw error;
}

export async function getAdminCafes(): Promise<PlatformCafe[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data: cafes, error } = await supabase
    .from("cafes")
    .select("*, cafe_settings(*), subscriptions(plan_id, status)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (cafes ?? []).map((row) => {
    const settings = row.cafe_settings as Record<string, unknown> | null;
    const subscriptions = row.subscriptions as { plan_id: string; status: string }[] | null;
    const activeSub = subscriptions?.find((item) => item.status === "active" || item.status === "trialing");
    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      ownerName: String(settings?.owner_name ?? ""),
      ownerEmail: String(settings?.owner_email ?? ""),
      ownerPhone: String(settings?.owner_phone ?? ""),
      planId: activeSub?.plan_id ?? "",
      status: row.status === "active" ? "نشط" : "موقوف",
      totalRevenue: 0,
      totalOrders: 0,
      customersCount: 0,
      createdAt: String(row.created_at).slice(0, 10),
      customDomain: settings?.custom_domain as string | undefined,
      customDomainStatus: settings?.domain_status as PlatformCafe["customDomainStatus"],
      purchasedDomain: settings?.purchased_domain as string | undefined,
      purchasedDomainStatus: settings?.purchased_domain_status as PlatformCafe["purchasedDomainStatus"],
    };
  });
}

export async function getAdminCustomers(): Promise<PlatformCustomer[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("*, cafes(name, id)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const cafe = row.cafes as unknown as { name: string; id: string } | null;
    return {
      id: String(row.id),
      fullName: String(row.full_name),
      phone: String(row.phone),
      email: row.email ? String(row.email) : undefined,
      cafeId: cafe?.id ?? "",
      cafeName: cafe?.name ?? "",
      status: "نشط",
      totalSpent: 0,
      loyaltyPoints: 0,
      createdAt: String(row.created_at).slice(0, 10),
    };
  });
}

export async function getAdminOperations(): Promise<PlatformOperation[]> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const [{ data: orders }, { data: reservations }] = await Promise.all([
    supabase.from("orders").select("id, total, status, customer_name, created_at, cafes(name, id)").order("created_at", { ascending: false }).limit(50),
    supabase.from("reservations").select("id, event_type, status, customer_name, created_at, cafes(name, id)").order("created_at", { ascending: false }).limit(50),
  ]);
  const operations: PlatformOperation[] = [];
  for (const row of orders ?? []) {
    const cafe = row.cafes as unknown as { name: string; id: string };
    operations.push({ id: String(row.id), cafeId: cafe.id, cafeName: cafe.name, customerName: String(row.customer_name), type: "طلب", title: `طلب ${row.id}`, amount: Number(row.total), status: String(row.status), createdAt: String(row.created_at).slice(0, 10) });
  }
  for (const row of reservations ?? []) {
    const cafe = row.cafes as unknown as { name: string; id: string };
    operations.push({ id: String(row.id), cafeId: cafe.id, cafeName: cafe.name, customerName: String(row.customer_name), type: "حجز", title: `حجز ${row.event_type}`, status: String(row.status), createdAt: String(row.created_at).slice(0, 10) });
  }
  return operations.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateCafePlan(cafeId: string, planId: string) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_assign_plan_without_payment", {
    p_cafe_id: cafeId,
    p_plan_id: planId,
  });
  if (error) throw error;
}

export async function updateCafeStatus(cafeId: string, active: boolean) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("cafes").update({ status: active ? "active" : "suspended" }).eq("id", cafeId);
  if (error) throw error;
}
