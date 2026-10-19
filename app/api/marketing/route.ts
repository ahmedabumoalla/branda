import { getMarketingDashboard, runMarketingAction, MarketingError } from "@/lib/data/marketing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  return Response.json({ ok: false, message: error instanceof MarketingError ? error.message : "تعذر إكمال الطلب حاول مجددًا" }, { status: error instanceof MarketingError ? error.status : 503, headers });
}
export async function GET() {
  try { return Response.json({ ok: true, data: { dashboard: await getMarketingDashboard() } }, { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ ok: false, message: "الطلب غير مسموح" }, { status: 403, headers });
  try {
    const content = await request.text();
    if (content.length > 80_000) throw new MarketingError("حجم الطلب أكبر من المسموح");
    let input: unknown;
    try { input = JSON.parse(content); } catch { throw new MarketingError("بيانات الطلب غير صحيحة"); }
    return Response.json({ ok: true, data: await runMarketingAction(input) }, { headers });
  } catch (error) { return failure(error); }
}
