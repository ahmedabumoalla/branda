import { NextResponse } from "next/server";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";

const DEFAULT_BARNDAKSA_ICON = "/brand/barndaksa-logo-brown.png";

function normalizeManifestIconUrl(url?: string | null) {
  if (!url) return DEFAULT_BARNDAKSA_ICON;
  if (url.startsWith("data:")) return DEFAULT_BARNDAKSA_ICON;
  return url;
}

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
  const iconUrl = normalizeManifestIconUrl(
    identity?.legacyLogoDataUrl ?? settings?.logoDataUrl ?? DEFAULT_BARNDAKSA_ICON,
  );
  const iconType = iconUrl.includes(".webp") ? "image/webp" : iconUrl.includes(".svg") ? "image/svg+xml" : "image/png";

  return NextResponse.json({
    name,
    short_name: name.slice(0, 12),
    description: `تطبيق ${name} على منصة بارنداكسا`,
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
