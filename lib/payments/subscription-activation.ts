import { createAdminClient } from "@/lib/supabase/admin";
import { brandAllowsNewWork } from '@/lib/data/account-cancellation';
import { areOnlinePaymentsEnabled } from "@/lib/payments/payment-availability";

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
  if (!areOnlinePaymentsEnabled()) return false;
  const admin = createAdminClient();
  const provider = input.provider ?? "paypal";
  // Payment, renewal periods and the shared deadline commit together. A retry
  // cannot cancel a paid period or send a second invoice after activation.
  const { data: activation, error: activationError } = await admin.rpc("activate_paid_brand_subscription", {
    p_cafe_id: input.cafeId,
    p_subscription_id: input.subscriptionId,
    p_payment: {
      provider,
      paymentMethodLabel: input.paymentMethodLabel ?? (provider === "paymob" ? "Paymob" : "PayPal"),
      captureId: input.captureId ?? null, orderId: input.orderId ?? null,
      amount: input.amount ?? null, currency: input.currency ?? null,
      paymobTransactionId: input.paymobTransactionId ?? null,
      paymobOrderId: input.paymobOrderId ?? null,
    },
  });
  if (activationError) throw activationError;
  if (activation?.activated !== true) return false;
  // The verified payment is already recorded atomically; archive status prevents
  // a new invoice notification without discarding the historical payment result.
  if (!await brandAllowsNewWork(input.cafeId)) return true;
  const { data, error } = await admin
    .from("subscriptions")
    .select("id,plan_id,platform_coupon_id,cafe_id,plan_name_snapshot,amount_sar,base_amount_sar,discount_amount_sar,coupon_code_snapshot,created_at,cafes(name,owner_email,tax_number,commercial_register)")
    .eq("id", input.subscriptionId)
    .eq("cafe_id", input.cafeId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return false;

  if (data.platform_coupon_id) {
    await admin.rpc("increment_platform_coupon_redemption", { p_coupon_id: data.platform_coupon_id });
  }

  const { sendSubscriptionInvoiceEmail } = await import("@/lib/email/subscription-invoice");
  await sendSubscriptionInvoiceEmail(data as Record<string, unknown>).catch((mailError) => {
    console.error("[activatePaidSubscription:invoice]", mailError);
  });

  return true;
}
