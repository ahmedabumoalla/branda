import { NextResponse } from "next/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { createClient } from "@/lib/supabase/server";
import {
  createPaymobPaymentIntention,
  getPaymobPaymentMethodLabel,
  isPaymobConfigured,
  normalizePaymobPaymentMethodChoice,
} from "@/lib/payments/paymob";

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function getBaseUrl(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  return (configured || origin || new URL(request.url).origin).replace(/\/+$/, "");
}

type PendingSubscription = {
  id: string;
  cafe_id: string;
  plan_id: string | null;
  amount_sar: number | string | null;
  plan_name_snapshot?: string | null;
};

type CafeOwnerSettings = {
  owner_email?: string | null;
  owner_phone?: string | null;
};

export async function POST(request: Request) {
  try {
    const cafe = await requireOwnerCafeContext();
    const body = (await request.json().catch(() => ({}))) as {
      subscriptionId?: string;
      paymentMethod?: string;
    };
    const paymentMethod = normalizePaymobPaymentMethodChoice(body.paymentMethod || "card");

    if (!isPaymobConfigured(paymentMethod)) {
      return NextResponse.json(
        { ok: false, message: "إعدادات طريقة الدفع غير مكتملة" },
        { status: 500 }
      );
    }

    const supabase = await createClient();

    let query = supabase
      .from("subscriptions")
      .select("id, cafe_id, plan_id, amount_sar, plan_name_snapshot")
      .eq("cafe_id", cafe.id)
      .eq("status", "past_due")
      .order("created_at", { ascending: false })
      .limit(1);

    if (body.subscriptionId) {
      query = query.eq("id", body.subscriptionId);
    }

    let subscription: PendingSubscription | null = null;
    const first = await query.maybeSingle<PendingSubscription>();

    if (first.error) {
      if (String(first.error.message ?? "").includes("plan_name_snapshot")) {
        let fallbackQuery = supabase
          .from("subscriptions")
          .select("id, cafe_id, plan_id, amount_sar")
          .eq("cafe_id", cafe.id)
          .eq("status", "past_due")
          .order("created_at", { ascending: false })
          .limit(1);

        if (body.subscriptionId) {
          fallbackQuery = fallbackQuery.eq("id", body.subscriptionId);
        }

        const fallback = await fallbackQuery.maybeSingle<PendingSubscription>();
        if (fallback.error) throw fallback.error;
        subscription = fallback.data ?? null;
      } else {
        throw first.error;
      }
    } else {
      subscription = first.data ?? null;
    }

    if (!subscription) {
      return NextResponse.json(
        { ok: false, message: "لا توجد فاتورة جاهزة للدفع" },
        { status: 404 }
      );
    }

    const { data: settings, error: settingsError } = await supabase
      .from("cafe_settings")
      .select("owner_email, owner_phone")
      .eq("cafe_id", cafe.id)
      .maybeSingle<CafeOwnerSettings>();

    if (settingsError) {
      console.warn("[paymob:create-intention] cafe_settings lookup failed", settingsError);
    }

    const amountSar = Number(subscription.amount_sar ?? 0);
    if (!Number.isFinite(amountSar) || amountSar <= 0) {
      return NextResponse.json(
        { ok: false, message: "قيمة الفاتورة غير صالحة للدفع الإلكتروني" },
        { status: 400 }
      );
    }

    const subscriptionId = String(subscription.id);
    const baseUrl = getBaseUrl(request);
    const planName = String(subscription.plan_name_snapshot ?? subscription.plan_id ?? "باقة");
    const paymentMethodLabel = getPaymobPaymentMethodLabel(paymentMethod);

    const intention = await createPaymobPaymentIntention({
      subscriptionId,
      cafeId: cafe.id,
      cafeName: cafe.name,
      planName,
      amountSar,
      customerEmail: settings?.owner_email ?? undefined,
      customerPhone: settings?.owner_phone ?? undefined,
      paymentMethod,
      returnUrl: `${baseUrl}/dashboard/subscription?payment=paymob_return&subscriptionId=${encodeURIComponent(subscriptionId)}`,
      notificationUrl: `${baseUrl}/api/payments/paymob/webhook`,
    });

    const updatePayload: Record<string, string> = {
      payment_provider: "paymob",
      payment_method_label: paymentMethodLabel,
      paymob_intention_id: intention.intentionId,
    };

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(updatePayload)
      .eq("id", subscriptionId)
      .eq("cafe_id", cafe.id);

    if (updateError) {
      const text = `${updateError.message ?? ""} ${updateError.details ?? ""}`;
      if (
        text.includes("payment_provider") ||
        text.includes("payment_method_label") ||
        text.includes("paymob_intention_id")
      ) {
        console.warn("[paymob:create-intention] tracking update skipped", updateError);
      } else {
        throw updateError;
      }
    }

    return NextResponse.json({
      ok: true,
      subscriptionId,
      intentionId: intention.intentionId,
      checkoutUrl: intention.checkoutUrl,
      paymentMethod,
      paymentMethodLabel,
    });
  } catch (error) {
    console.error("[paymob:create-intention]", error);
    return NextResponse.json(
      { ok: false, message: "تعذر تجهيز عملية Paymob", error: message(error) },
      { status: 500 }
    );
  }
}
