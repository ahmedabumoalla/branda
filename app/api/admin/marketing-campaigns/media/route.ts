import { runPlatformCampaignMediaAction } from "@/lib/marketing/platform-media";
import { platformCampaignBody, platformCampaignFailure, platformCampaignHeaders } from "@/lib/marketing/platform-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request) {
  try { return Response.json({ ok: true, data: await runPlatformCampaignMediaAction(await platformCampaignBody(request)) }, { headers: platformCampaignHeaders }); }
  catch (error) { return platformCampaignFailure(error); }
}
