import { NextResponse } from "next/server";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";


type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  const [settings, identity] = await Promise.all([
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  const name = settings?.cafeName || cafe?.name || "Barndaksa";
  const startUrl = `/c/${encodeURIComponent(slug)}`;
  const iconUrl = getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );
  const iconType = iconUrl.includes(".webp") ? "image/webp" : iconUrl.includes(".svg") ? "image/svg+xml" : "image/png";

  return NextResponse.json({
    name,
    short_name: name.slice(0, 12),
    description: `تطبيق ${name} على منصة برندة`,
    start_url: startUrl,
    scope: `/c/${encodeURIComponent(slug)}`,
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#F8F4EF",
    theme_color: "#4A281D",
    icons: [
      {
        src: iconUrl,
        sizes: "192x192",
        type: iconType,
        purpose: "any maskable",
      },
      {
        src: iconUrl,
        sizes: "512x512",
        type: iconType,
        purpose: "any maskable",
      },
    ],
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
