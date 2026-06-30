import { NextResponse } from "next/server";
import { getPublicBranchesBySlug } from "@/lib/data/branches";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { publicCacheHeader } from "@/lib/performance/server-cache";

type Props = {
  params: Promise<{ slug: string }>;
};

const MANIFEST_TTL_SECONDS = 60;

function cleanText(value?: string | null) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function hashToken(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function iconVersion(...candidates: Array<string | null | undefined>) {
  const source = candidates.map(cleanText).find(Boolean);
  return source ? hashToken(source) : "fallback";
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
  const [cafe, settings, identity, branches] = await Promise.all([
    getCafeBySlug(slug).catch(() => null),
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
    getPublicBranchesBySlug(slug).catch(() => []),
  ]);

  const configuredBrandName = cleanText(settings?.cafeName) || cleanText(cafe?.name);
  const brandName = configuredBrandName || "برندة";
  const branchName = cleanText(branches.find((branch) => branch.active !== false)?.name);
  const name =
    branchName && branchName !== brandName
      ? `${brandName} - ${branchName}`
      : brandName;
  const startUrl = `/c/${encodeURIComponent(slug)}`;
  const scope = `/c/${encodeURIComponent(slug)}`;
  const version = iconVersion(
    settings?.logoAssetId,
    identity?.logoAssetId,
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
    brandName,
    branchName,
  );

  return {
    name,
    short_name: brandName.slice(0, 12),
    description: configuredBrandName ? `تطبيق ${name}` : "تطبيق برندة",
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
      "x-barndaksa-pwa-manifest": "brand-icon-v5",
    },
  });
}
