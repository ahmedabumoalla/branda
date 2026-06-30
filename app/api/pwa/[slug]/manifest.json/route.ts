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

function manifestIcon(slug: string, size: 192 | 512, purpose: "any" | "maskable", version: string) {
  return {
    src: iconSrc(slug, size, purpose, version),
    sizes: `${size}x${size}`,
    type: "image/svg+xml",
    purpose,
  };
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
    id: startUrl,
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
      manifestIcon(slug, 192, "any", version),
      manifestIcon(slug, 512, "any", version),
      manifestIcon(slug, 192, "maskable", version),
      manifestIcon(slug, 512, "maskable", version),
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
      "Content-Type": "application/manifest+json; charset=utf-8",
      "x-barndaksa-pwa-manifest": "brand-icon-json-v2",
    },
  });
}
