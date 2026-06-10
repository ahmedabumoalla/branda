import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { capturePaypalOrder } from "@/lib/payments/paypal";
import { activatePaidSubscription } from "@/lib/payments/subscription-activation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("token");
  const subscriptionId = url.searchParams.get("subscriptionId");
  const baseUrl = `${url.protocol}//${url.host}`;

  if (!orderId || !subscriptionId) {
    return NextResponse.redirect(`${baseUrl}/dashboard/subscription?payment=missing`);
  }

  try {
    const admin = createAdminClient();
    const { data: subscription, error } = await admin
      .from("subscriptions")
      .select("id, cafe_id")
      .eq("id", subscriptionId)
      .eq("paypal_order_id", orderId)
      .eq("status", "past_due")
      .maybeSingle();

    if (error) throw error;
    if (!subscription) {
      return NextResponse.redirect(`${baseUrl}/dashboard/subscription?payment=not_found`);
    }

    const capture = await capturePaypalOrder(orderId);
    const activated = await activatePaidSubscription({
      cafeId: String(subscription.cafe_id),
      subscriptionId,
      captureId: capture.captureId,
      orderId: capture.orderId,
      amount: capture.amount,
      currency: capture.currency,
    });

    return NextResponse.redirect(
      `${baseUrl}/dashboard/subscription?payment=${activated ? "success" : "not_activated"}`
    );
  } catch (error) {
    console.error("[subscription:return]", error);
    return NextResponse.redirect(`${baseUrl}/dashboard/subscription?payment=failed`);
  }
}
