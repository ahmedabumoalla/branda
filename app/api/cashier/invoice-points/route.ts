import { z } from "zod";
import { addCashierInvoicePointsAction, resolveInvoiceCardAction } from "@/app/actions/cashier-invoice-points";
import { invoiceCreditSchema, invoiceScopeSchema } from "@/lib/loyalty/invoice-points-input";

const resolve = z.object({ step: z.literal("resolve"), scope: invoiceScopeSchema, identifier: z.string().trim().min(1).max(500) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// A fetch endpoint allows background sync without serializing the cashier's
// interactive Server Actions behind a slow upload.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ ok: false, reason: "unauthorized" }, 403);
  }
  const body = await request.json().catch(() => null);
  try {
    if (body?.step === "resolve") {
      const parsed = resolve.safeParse(body);
      if (!parsed.success) return reply({ ok: false, reason: "invalid_input" }, 400);
      const code = await resolveInvoiceCardAction(parsed.data.scope, parsed.data.identifier);
      return reply({ ok: true, cardCode: code });
    }
    if (body?.step !== "credit") return reply({ ok: false, reason: "invalid_input" }, 400);
    const { step, ...input } = body;
    const parsed = invoiceCreditSchema.safeParse(input);
    if (!parsed.success) return reply({ ok: false, reason: "invalid_input" }, 400);
    return reply(await addCashierInvoicePointsAction(parsed.data));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (["رمز البطاقة غير صالح", "أدخل رقم جوال سعودي صحيح يبدأ بـ 05", "لا توجد بطاقة ولاء متاحة لهذا الرقم لدى العلامة"].includes(message)) {
      return reply({ ok: false, reason: "card_unavailable" });
    }
    if (["Cashier session expired", "تغيرت جلسة الكاشير افتح القارئ مجددًا", "لا تملك صلاحية استخدام هذه الخدمة أو أن اشتراكها غير مفعّل"].includes(message)) {
      return reply({ ok: false, reason: "unauthorized" }, 403);
    }
    return reply({ ok: false, reason: "unavailable" }, 503);
  }
}
