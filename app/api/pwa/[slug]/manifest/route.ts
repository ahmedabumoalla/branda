import { NextResponse } from "next/server";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { publicCacheHeader } from "@/lib/performance/server-cache";

type Props = {
  params: Promise<{ slug: string }>;
};

const MANIFEST_TTL_SECONDS = 10 * 60;

function iconVersion(...candidates: Array<string | null | undefined>) {
  return candidates.find((candidate) => candidate?.trim())?.trim() ?? "fallback";
}

function iconSrc(slug: string, size: 192 | 512, purpose: "any" | "maskable", version: string) {
  const params = new URLSearchParams({
    size: String(size),
    purpose,
    v: version,
  });

  return `/api/public/cafe/${encodeURIComponent(slug)}/favicon?${params.toString()}`;
}

async function loadManifest(slug: string) {
  const [cafe, settings, identity] = await Promise.all([
    getCafeBySlug(slug).catch(() => null),
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  const name = settings?.cafeName || cafe?.name || "Barndaksa";
  const startUrl = `/c/${encodeURIComponent(slug)}`;
  const scope = `/c/`;
  const version = iconVersion(
    settings?.logoAssetId,
    identity?.logoAssetId,
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );

  return {
    name,
    short_name: name.slice(0, 12),
    description: `تطبيق ${name} على منصة برندة`,
    start_url: startUrl,
    scope,
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#F8F4EF",
    theme_color: "#4A281D",
    icons: [
      {
        src: iconSrc(slug, 192, "any", version),
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: iconSrc(slug, 512, "any", version),
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: iconSrc(slug, 192, "maskable", version),
        sizes: "192x192",
        purpose: "maskable",
      },
      {
        src: iconSrc(slug, 512, "maskable", version),
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const manifest = await loadManifest(normalizedSlug);

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": publicCacheHeader(MANIFEST_TTL_SECONDS),
      "x-barndaksa-pwa-manifest": "brand-icon-v4",
    },
  });
}
