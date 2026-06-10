import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { requireOwnerCafeContext } from "@/lib/data/cafes";

import { getPlatformPlans } from "@/lib/data/admin";

import type {

  PendingSubscription,

  SubscriptionRecord,

} from "@/lib/platform/subscription";



function mapDbStatusToPaymentStatus(

  status: string

): SubscriptionRecord["paymentStatus"] {

  if (status === "active" || status === "trialing") return "paid";

  if (status === "past_due") return "pending";

  return "failed";

}



function mapDbRowToRecord(row: Record<string, unknown>): SubscriptionRecord {

  const plan = row.platform_plans as { name: string } | null;

  const status = row.status as string;

  return {

    id: row.id as string,

    planId: row.plan_id as string,

    planName: plan?.name ?? (row.plan_id as string),

    amount: Number(row.amount_sar),

    paymentStatus: mapDbStatusToPaymentStatus(status),

    createdAt: row.created_at as string,

    paidAt:

      status === "active" || status === "trialing"

        ? ((row.started_at as string) ?? (row.created_at as string))

        : undefined,

    paymentMethodLabel: (row.payment_method_label as string) ?? undefined,

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

  return (data ?? []).map(mapDbRowToRecord);

}



export async function getOwnerPendingSubscription(): Promise<PendingSubscription | null> {

  const cafe = await requireOwnerCafeContext();

  const supabase = await createClient();

  const { data, error } = await supabase

    .from("subscriptions")

    .select("*, platform_plans(name)")

    .eq("cafe_id", cafe.id)

    .eq("status", "past_due")

    .order("created_at", { ascending: false })

    .limit(1)

    .maybeSingle();



  if (error) throw error;

  if (!data) return null;



  const plan = data.platform_plans as { name: string } | null;

  return {

    id: data.id as string,

    planId: data.plan_id as string,

    planName: plan?.name ?? (data.plan_id as string),

    amount: Number(data.amount_sar),

    paymentStatus: "pending",

    createdAt: data.created_at as string,

  };

}



export async function startOwnerPlanCheckout(planId: string): Promise<string> {

  const cafe = await requireOwnerCafeContext();

  const plans = await getPlatformPlans();

  const plan = plans.find((item) => item.id === planId);

  if (!plan) throw new Error("الباقة غير موجودة");



  const supabase = createAdminClient();

  const { data, error } = await supabase

    .from("subscriptions")

    .insert({

      cafe_id: cafe.id,

      plan_id: planId,

      status: "past_due",

      amount_sar: plan.priceMonthly,
      plan_name_snapshot: plan.name,
      duration_unit: plan.durationUnit,
      duration_count: plan.durationCount,
      activation_source: "brand_card_checkout",
      payment_provider: "paypal",
      payment_method_label: "بطاقة بنكية",

    })

    .select("id")

    .single();



  if (error) throw error;

  return data.id as string;

}



export async function completeOwnerPlanPayment(subscriptionId?: string): Promise<boolean> {

  const cafe = await requireOwnerCafeContext();

  const supabase = createAdminClient();



  let targetId = subscriptionId;

  if (!targetId) {

    const { data: pending } = await supabase

      .from("subscriptions")

      .select("id")

      .eq("cafe_id", cafe.id)

      .eq("status", "past_due")

      .order("created_at", { ascending: false })

      .limit(1)

      .maybeSingle();

    if (!pending) return false;

    targetId = pending.id as string;

  }



  const paidAt = new Date().toISOString();



  await supabase

    .from("subscriptions")

    .update({ status: "cancelled", cancelled_at: paidAt })

    .eq("cafe_id", cafe.id)

    .in("status", ["active", "trialing"]);



  const { error } = await supabase

    .from("subscriptions")

    .update({ status: "active", started_at: paidAt })

    .eq("id", targetId)

    .eq("cafe_id", cafe.id);



  if (error) throw error;

  return true;

}



export async function failOwnerPlanPayment(): Promise<void> {

  const cafe = await requireOwnerCafeContext();

  const supabase = createAdminClient();

  const { error } = await supabase

    .from("subscriptions")

    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })

    .eq("cafe_id", cafe.id)

    .eq("status", "past_due");



  if (error) throw error;

}



// Compatibility aliases for older dashboard imports.
export async function getAvailablePlans() {
  return getPlatformPlans();
}

export async function getOwnerActiveSubscription() {
  return getOwnerPendingSubscription();
}

export async function getOwnerSubscriptionRequests() {
  return [];
}
