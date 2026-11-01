import { getPlatformCampaignDashboard, runPlatformCampaignAction } from "@/lib/data/platform-marketing";
import { platformCampaignBody, platformCampaignFailure, platformCampaignHeaders } from "@/lib/marketing/platform-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try { return Response.json({ ok: true, data: await getPlatformCampaignDashboard() }, { headers: platformCampaignHeaders }); }
  catch (error) { return platformCampaignFailure(error); }
}
export async function POST(request: Request) {
  try { return Response.json({ ok: true, data: await runPlatformCampaignAction(await platformCampaignBody(request)) }, { headers: platformCampaignHeaders }); }
  catch (error) { return platformCampaignFailure(error); }
}
