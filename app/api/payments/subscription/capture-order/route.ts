import { NextResponse } from "next/server";
import { requireOwnerCafeContext } from "@/lib/data/cafes";
import { capturePaypalOrder } from "@/lib/payments/paypal";
import { activatePaidSubscription } from "@/lib/payments/subscription-activation";

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export async function POST(request: Request) {
  try {
    const cafe = await requireOwnerCafeContext();
    const body = (await request.json().catch(() => ({}))) as {
      orderId?: string;
      subscriptionId?: string;
    };

    if (!body.orderId || !body.subscriptionId) {
      return NextResponse.json(
        { ok: false, message: "orderId و subscriptionId مطلوبة" },
        { status: 400 }
      );
    }

    const capture = await capturePaypalOrder(body.orderId);
    const activated = await activatePaidSubscription({
      cafeId: cafe.id,
      subscriptionId: body.subscriptionId,
      captureId: capture.captureId,
      orderId: capture.orderId,
      amount: capture.amount,
      currency: capture.currency,
    });

    if (!activated) {
      return NextResponse.json(
        { ok: false, message: "تم الدفع لكن لم يتم العثور على الاشتراك المعلق" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      paymentMethodLabel: "بطاقة بنكية",
      captureId: capture.captureId,
    });
  } catch (error) {
    console.error("[subscription:capture-order]", error);
    return NextResponse.json(
      { ok: false, message: "تعذر تأكيد الدفع", error: message(error) },
      { status: 500 }
    );
  }
}
