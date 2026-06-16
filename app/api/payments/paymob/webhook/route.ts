import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activatePaidSubscription } from "@/lib/payments/subscription-activation";
import {
  extractSubscriptionIdFromPaymobPayload,
  getPaymobOrderId,
  getPaymobTransactionId,
  isPaymobHmacRequired,
  isPaymobTransactionSuccess,
  verifyPaymobWebhookHmac,
} from "@/lib/payments/paymob";

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.json().catch(() => ({}));
  const text = await request.text();
  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }
}

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const providedHmac = url.searchParams.get("hmac") ?? request.headers.get("x-paymob-hmac");
  const payload = await parseBody(request);
  const hmac = verifyPaymobWebhookHmac(payload, providedHmac);

  try {
    if (isPaymobHmacRequired() && hmac.configured && !hmac.verified) {
      return NextResponse.json({ ok: false, message: "Invalid Paymob HMAC" }, { status: 401 });
    }

    const admin = createAdminClient();
    const subscriptionId = extractSubscriptionIdFromPaymobPayload(payload);
    const transactionId = getPaymobTransactionId(payload);
    const orderId = getPaymobOrderId(payload);
    const success = isPaymobTransactionSuccess(payload);

    await admin.from("subscription_payment_events").insert({
      provider: "paymob",
      subscription_id: subscriptionId,
      provider_event_id: transactionId || orderId || null,
      event_type: success ? "transaction_success" : "transaction_failed",
      verified: hmac.verified,
      payload,
    }).then(() => undefined, (eventError) => {
      console.error("[paymob:webhook:event]", eventError);
    });

    if (!subscriptionId) {
      return NextResponse.json({ ok: true, ignored: true, message: "subscription id not found" });
    }

    if (!success) {
      await admin
        .from("subscriptions")
        .update({ payment_provider: "paymob", payment_method_label: "Paymob", paymob_transaction_id: transactionId || null, paymob_order_id: orderId || null })
        .eq("id", subscriptionId)
        .eq("status", "past_due");
      return NextResponse.json({ ok: true, paid: false });
    }

    const { data: subscription, error } = await admin
      .from("subscriptions")
      .select("id,cafe_id")
      .eq("id", subscriptionId)
      .eq("status", "past_due")
      .maybeSingle();

    if (error) throw error;
    if (!subscription) return NextResponse.json({ ok: true, activated: false, message: "subscription not pending" });

    const activated = await activatePaidSubscription({
      cafeId: String(subscription.cafe_id),
      subscriptionId,
      provider: "paymob",
      paymentMethodLabel: "Paymob",
      paymobTransactionId: transactionId || undefined,
      paymobOrderId: orderId || undefined,
      amount: 0,
      currency: "SAR",
    });

    return NextResponse.json({ ok: true, activated });
  } catch (error) {
    console.error("[paymob:webhook]", error);
    return NextResponse.json({ ok: false, message: message(error) }, { status: 500 });
  }
}
