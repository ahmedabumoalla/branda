import { getPlatformCampaignAudience } from "@/lib/data/platform-marketing";
import { platformCampaignFailure, platformCampaignHeaders } from "@/lib/marketing/platform-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    if (!params.brandId) delete params.brandId;
    return Response.json({ ok: true, data: await getPlatformCampaignAudience(params) }, { headers: platformCampaignHeaders });
  } catch (error) { return platformCampaignFailure(error); }
}
