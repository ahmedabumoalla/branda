import { BrandWhatsAppError, getBrandWhatsAppDashboard, runBrandWhatsAppAction } from "@/lib/data/brand-whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function failure(error: unknown) {
  return Response.json({ ok: false, message: error instanceof BrandWhatsAppError ? error.message : "تعذر إكمال الطلب حاول مجددًا" }, {
    status: error instanceof BrandWhatsAppError ? error.status : 503, headers,
  });
}

export async function GET() {
  try { return Response.json({ ok: true, data: { dashboard: await getBrandWhatsAppDashboard() } }, { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ ok: false, message: "الطلب غير مسموح" }, { status: 403, headers });
  try {
    if (Number(request.headers.get("content-length") || 0) > 2_000) throw new BrandWhatsAppError("حجم الطلب أكبر من المسموح", 413);
    const raw = await request.text();
    if (raw.length > 2_000) throw new BrandWhatsAppError("حجم الطلب أكبر من المسموح", 413);
    let input: unknown;
    try { input = JSON.parse(raw); } catch { throw new BrandWhatsAppError("بيانات الطلب غير صحيحة"); }
    return Response.json({ ok: true, data: await runBrandWhatsAppAction(input) }, { headers });
  } catch (error) { return failure(error); }
}
