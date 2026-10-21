import { CampaignReportAccessError, campaignHistoryInputSchema, getAdminCampaignReport } from "@/lib/data/marketing-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const parsed = campaignHistoryInputSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ message: "بيانات السجل غير صحيحة" }, { status: 400, headers });
  try {
    const { brandId, page, from, to } = parsed.data;
    const report = await getAdminCampaignReport({ from, to }, brandId, page);
    return Response.json(report.history, { headers });
  } catch (error) {
    return Response.json({ message: "تعذر تحميل سجل الحملات" }, { status: error instanceof CampaignReportAccessError ? 403 : 503, headers });
  }
}
