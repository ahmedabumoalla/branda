import { NextResponse } from "next/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import { createPaypalSubscriptionOrder, isPaypalConfigured } from "@/lib/payments/paypal";

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export async function POST(request: Request) {
  try {
    const cafe = await requireOwnerCafeContext();

    if (!isPaypalConfigured()) {
      return NextResponse.json(
        { ok: false, message: "إعدادات بوابة الدفع غير مكتملة" },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { subscriptionId?: string };
    const supabase = await createClient();

    let query = supabase
      .from("subscriptions")
      .select("id, plan_id, amount_sar, platform_plans(name)")
      .eq("cafe_id", cafe.id)
      .eq("status", "past_due")
      .order("created_at", { ascending: false })
      .limit(1);

    if (body.subscriptionId) {
      query = query.eq("id", body.subscriptionId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, message: "لا توجد فاتورة بانتظار الدفع" },
        { status: 404 }
      );
    }

    const plan = data.platform_plans as { name?: string } | null;
    const amountWithVat = Number(data.amount_sar ?? 0);

    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
    const subscriptionId = String(data.id);
    const order = await createPaypalSubscriptionOrder({
      subscriptionId,
      cafeName: cafe.name,
      planName: plan?.name ?? String(data.plan_id),
      amountSar: amountWithVat,
      returnUrl: `${origin}/api/payments/subscription/return?subscriptionId=${encodeURIComponent(subscriptionId)}`,
      cancelUrl: `${origin}/dashboard/subscription?payment=cancelled`,
    });

    await supabase
      .from("subscriptions")
      .update({
        payment_provider: "paypal",
        payment_method_label: "بطاقة بنكية",
        paypal_order_id: order.id,
        paypal_currency: order.currency,
        paypal_amount: Number(order.value),
        paypal_exchange_rate: order.rate,
      })
      .eq("id", data.id)
      .eq("cafe_id", cafe.id);

    if (!order.approveUrl) {
      return NextResponse.json(
        { ok: false, message: "تعذر تجهيز رابط الدفع" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      approveUrl: order.approveUrl,
      subscriptionId: data.id,
    });
  } catch (error) {
    console.error("[subscription:create-order]", error);
    return NextResponse.json(
      { ok: false, message: "تعذر إنشاء عملية الدفع", error: message(error) },
      { status: 500 }
    );
  }
}
