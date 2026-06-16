import { createAdminClient } from "@/lib/supabase/admin";

export async function activatePaidSubscription(input: {
  cafeId: string;
  subscriptionId: string;
  captureId?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  provider?: "paypal" | "paymob" | string;
  paymentMethodLabel?: string;
  paymobTransactionId?: string;
  paymobOrderId?: string;
}) {
  const admin = createAdminClient();
  const paidAt = new Date().toISOString();
  const provider = input.provider ?? "paypal";

  await admin
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: paidAt })
    .eq("cafe_id", input.cafeId)
    .in("status", ["active", "trialing"]);

  const updatePayload: Record<string, unknown> = {
    status: "active",
    started_at: paidAt,
    payment_provider: provider,
    payment_method_label: input.paymentMethodLabel ?? (provider === "paymob" ? "Paymob" : "PayPal"),
    paid_at: paidAt,
  };

  if (provider === "paypal") {
    updatePayload.paypal_order_id = input.orderId ?? null;
    updatePayload.paypal_capture_id = input.captureId ?? null;
    updatePayload.paypal_currency = input.currency ?? null;
    updatePayload.paypal_amount = input.amount ?? null;
  }

  if (provider === "paymob") {
    updatePayload.paymob_transaction_id = input.paymobTransactionId ?? null;
    updatePayload.paymob_order_id = input.paymobOrderId ?? null;
  }

  const { data, error } = await admin
    .from("subscriptions")
    .update(updatePayload)
    .eq("id", input.subscriptionId)
    .eq("cafe_id", input.cafeId)
    .eq("status", "past_due")
    .select("id,platform_coupon_id,cafe_id,plan_name_snapshot,amount_sar,base_amount_sar,discount_amount_sar,coupon_code_snapshot,created_at,cafes(name,owner_email,tax_number,commercial_register)")
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  await admin.rpc("record_subscription_finance_distribution", { p_subscription_id: input.subscriptionId });

  if (data.platform_coupon_id) {
    await admin.rpc("increment_platform_coupon_redemption", { p_coupon_id: data.platform_coupon_id });
  }

  const { sendSubscriptionInvoiceEmail } = await import("@/lib/email/subscription-invoice");
  await sendSubscriptionInvoiceEmail(data as Record<string, unknown>).catch((mailError) => {
    console.error("[activatePaidSubscription:invoice]", mailError);
  });

  return true;
}
