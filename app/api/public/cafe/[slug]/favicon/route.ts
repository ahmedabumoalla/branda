import { NextResponse } from "next/server";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";

type Props = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;

  const [settings, identity] = await Promise.all([
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  const iconUrl = getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );

  const redirectUrl = new URL(iconUrl, request.url);
  const response = NextResponse.redirect(redirectUrl, 307);
  response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
