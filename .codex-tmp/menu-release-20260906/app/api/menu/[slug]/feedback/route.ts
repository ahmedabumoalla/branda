import { FeedbackError, feedbackSchema, submitMenuFeedback } from "@/lib/data/menu-feedback";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const reply = (body: object, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(status === 429 ? { "Retry-After": "300" } : {}) } });
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "الطلب غير مسموح" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "صيغة غير مدعومة" }, 415);
  // Bound actual streamed bytes as Content-Length is optional and untrusted
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "بيانات التقييم مطلوبة" }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return reply({ error: "التقييم أطول من الحد المسموح" }, 413); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return reply({ error: "راجع بيانات التقييم" }, 400); }
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) return reply({ error: "اختر تقييمًا واكتب ملاحظات لا تتجاوز 1500 حرف" }, 400);
    const { slug } = await params;
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    return reply(await submitMenuFeedback(slug, parsed.data, address), 200);
  } catch (error) {
    if (error instanceof FeedbackError) return reply({ error: error.publicMessage }, error.status);
    return reply({ error: "تعذر استقبال التقييم الآن حاول لاحقًا" }, 503);
  } finally { reader.releaseLock(); }
}
