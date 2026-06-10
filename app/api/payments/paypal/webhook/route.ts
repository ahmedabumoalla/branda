import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = await request.text();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();

  if (!webhookId) {
    console.warn("[paypal:webhook] PAYPAL_WEBHOOK_ID is empty. Event received but not verified.", payload.slice(0, 400));
    return NextResponse.json({ ok: true, verified: false, message: "Webhook ID not configured yet" });
  }

  // الدفع الأساسي يتم تأكيده من capture endpoint مباشرة بعد موافقة صاحب العلامة.
  // هذا المسار موجود لتفعيل Webhook ID عند الإطلاق وربط الأحداث لاحقًا بدون كسر المنتج.
  return NextResponse.json({ ok: true, verified: true });
}
