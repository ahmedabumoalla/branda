import { z } from "zod";
import { addCashierInvoicePointsAction, resolveInvoiceCardAction } from "@/app/actions/cashier-invoice-points";

const scope = z.object({ cafeId: z.string().uuid(), cashierId: z.string().uuid() }).strict();
const resolve = z.object({ step: z.literal("resolve"), scope, identifier: z.string().trim().min(1).max(500) }).strict();
const credit = z.object({ step: z.literal("credit"), scope, cardCode: z.string().regex(/^[A-Z0-9_-]{1,100}$/),
  requestId: z.string().uuid(), amountHalalas: z.number().int().min(1).max(100_000_000),
  rateSar: z.number().finite().positive(), rateQuantity: z.number().int().positive() }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

// A fetch endpoint allows background sync without serializing the cashier's
// interactive Server Actions behind a slow upload.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return reply({ ok: false, reason: "unauthorized" }, 403);
  }
  const parsed = z.discriminatedUnion("step", [resolve, credit]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, reason: "invalid_input" }, 400);
  try {
    if (parsed.data.step === "resolve") {
      const code = await resolveInvoiceCardAction(parsed.data.scope, parsed.data.identifier);
      return reply({ ok: true, cardCode: code });
    }
    const { step, ...input } = parsed.data;
    return reply(await addCashierInvoicePointsAction(input));
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
