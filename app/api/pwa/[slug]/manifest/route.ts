import { NextResponse } from "next/server";
import { getCafeBySlug } from "@/lib/data/cafes";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const cafe = await getCafeBySlug(slug);

  const name = cafe?.name ? `${cafe.name}` : "Branda";
  const startUrl = `/c/${encodeURIComponent(slug)}`;

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
        src: "/brand/branda-logo-brown.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable"
      },
      {
        src: "/brand/branda-logo-brown.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable"
      }
    ]
  });
}
