import { MarketingError } from "@/lib/data/marketing";
import { runMarketingMediaAction } from "@/lib/marketing/media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, message: "الطلب غير مسموح" }, { status: 403, headers });
  try {
    const content = await request.text();
    if (content.length > 2000) throw new MarketingError("بيانات المرفق أكبر من المسموح");
    let input: unknown;
    try { input = JSON.parse(content); } catch { throw new MarketingError("بيانات المرفق غير صحيحة"); }
    return Response.json({ ok: true, data: await runMarketingMediaAction(input) }, { headers });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof MarketingError ? error.message : "تعذر رفع المرفق حاول مجددًا" }, { status: error instanceof MarketingError ? error.status : 503, headers });
  }
}
