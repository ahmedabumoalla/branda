import "server-only";
import { PlatformMarketingError } from "@/lib/data/platform-marketing";

export const platformCampaignHeaders = { "Cache-Control": "private, no-store" };
export function platformCampaignFailure(error: unknown) {
  return Response.json({ ok: false, message: error instanceof PlatformMarketingError ? error.message : "تعذر إكمال الطلب حاول مجددًا" }, { status: error instanceof PlatformMarketingError ? error.status : 503, headers: platformCampaignHeaders });
}
export async function platformCampaignBody(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) throw new PlatformMarketingError("الطلب غير مسموح", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 250_000) throw new PlatformMarketingError("حجم الطلب أكبر من المسموح", 413);
  const text = await request.text();
  if (text.length > 250_000) throw new PlatformMarketingError("حجم الطلب أكبر من المسموح", 413);
  try { return JSON.parse(text); } catch { throw new PlatformMarketingError("بيانات الطلب غير صحيحة"); }
}
