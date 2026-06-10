import { createAdminClient } from "@/lib/supabase/admin";

export async function activatePaidSubscription(input: {
  cafeId: string;
  subscriptionId: string;
  captureId: string;
  orderId: string;
  amount: number;
  currency: string;
}) {
  const admin = createAdminClient();
  const paidAt = new Date().toISOString();

  await admin
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: paidAt })
    .eq("cafe_id", input.cafeId)
    .in("status", ["active", "trialing"]);

  const { data, error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      started_at: paidAt,
      payment_provider: "paypal",
      payment_method_label: "بطاقة بنكية",
      paypal_order_id: input.orderId,
      paypal_capture_id: input.captureId,
      paypal_currency: input.currency,
      paypal_amount: input.amount,
      paid_at: paidAt,
    })
    .eq("id", input.subscriptionId)
    .eq("cafe_id", input.cafeId)
    .eq("status", "past_due")
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
