import { NextResponse } from "next/server";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);
  const settings = await getPublicCafeSettings(slug).catch(() => null);

  const name = settings?.cafeName || cafe?.name || "Barndaksa";
  const startUrl = `/c/${encodeURIComponent(slug)}`;
  const iconUrl = `/api/public/cafe/${encodeURIComponent(slug)}/favicon`;

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
        src: `${iconUrl}?size=192`,
        sizes: "192x192",
        purpose: "any maskable",
      },
      {
        src: `${iconUrl}?size=512`,
        sizes: "512x512",
        purpose: "any maskable",
      },
    ],
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
