import { createClient } from "@/lib/supabase/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import type { PlanDurationUnit, PlatformPlan } from "@/lib/platform/admin-data";
import type {
  ActiveSubscription,
  SubscriptionPaymentMethod,
  SubscriptionPaymentRequest,
  SubscriptionRecord,
} from "@/lib/platform/subscription";

function mapPlan(row: Record<string, unknown>): PlatformPlan {
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
    isDefault: false,
    features: Array.isArray(row.features) ? (row.features as PlatformPlan["features"]) : [],
  };
}

export async function getAvailablePlans(): Promise<PlatformPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_plans").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []).map(mapPlan);
}

export async function getOwnerActiveSubscription(): Promise<ActiveSubscription | null> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, platform_plans(name)")
    .eq("cafe_id", cafe.id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const plan = data.platform_plans as { name?: string } | null;
  return {
    id: String(data.id),
    planId: String(data.plan_id),
    planName: String(data.plan_name_snapshot ?? plan?.name ?? data.plan_id),
    amount: Number(data.amount_sar ?? 0),
    durationUnit: String(data.duration_unit ?? "month") as PlanDurationUnit,
    durationCount: Number(data.duration_count ?? 1),
    startedAt: String(data.started_at),
    expiresAt: data.expires_at ? String(data.expires_at) : undefined,
  };
}

export async function getOwnerSubscriptionHistory(): Promise<SubscriptionRecord[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, platform_plans(name)")
    .eq("cafe_id", cafe.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => {
    const plan = row.platform_plans as { name?: string } | null;
    const status = String(row.status);
    return {
      id: String(row.id),
      planId: String(row.plan_id),
      planName: String(row.plan_name_snapshot ?? plan?.name ?? row.plan_id),
      amount: Number(row.amount_sar ?? 0),
      paymentStatus: status === "active" || status === "trialing" ? "active" : status === "expired" ? "expired" : "cancelled",
      durationUnit: String(row.duration_unit ?? "month") as PlanDurationUnit,
      durationCount: Number(row.duration_count ?? 1),
      createdAt: String(row.created_at),
      startedAt: row.started_at ? String(row.started_at) : undefined,
      expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    };
  });
}

export async function getOwnerSubscriptionRequests(): Promise<SubscriptionPaymentRequest[]> {
  const cafe = await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_payment_requests")
    .select("*, branches(name)")
    .eq("cafe_id", cafe.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => {
    const branch = row.branches as { name?: string } | null;
    return {
      id: String(row.id),
      cafeId: cafe.id,
      planId: String(row.plan_id),
      planName: String(row.plan_name),
      baseAmount: Number(row.base_amount_sar),
      amount: Number(row.amount_sar),
      durationUnit: String(row.duration_unit) as PlanDurationUnit,
      durationCount: Number(row.duration_count),
      paymentMethod: row.payment_method as SubscriptionPaymentMethod,
      branchId: row.branch_id ? String(row.branch_id) : undefined,
      branchName: branch?.name,
      receiptStoragePath: row.receipt_storage_path ? String(row.receipt_storage_path) : undefined,
      status: row.status as SubscriptionPaymentRequest["status"],
      createdAt: String(row.created_at),
      adminResponse: row.admin_response ? String(row.admin_response) : undefined,
    };
  });
}

export async function createOwnerSubscriptionRequest(input: {
  planId: string;
  paymentMethod: SubscriptionPaymentMethod;
  branchId?: string;
}): Promise<string> {
  await requireOwnerCafeContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_subscription_payment_request", {
    p_plan_id: input.planId,
    p_payment_method: input.paymentMethod,
    p_branch_id: input.branchId ?? null,
  });
  if (error) throw error;
  return String(data);
}
