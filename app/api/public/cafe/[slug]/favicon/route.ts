import { NextResponse } from "next/server";
import {
  getPreferredCafeDisplayLogoUrl,
  isDefaultBarndaksaCafeLogo,
} from "@/lib/cafe/cafe-display-logo";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { publicCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Props = {
  params: Promise<{ slug: string }>;
};

const ICON_TTL_SECONDS = 10 * 60;
const FALLBACK_ANY_ICONS = {
  192: "/brand/barndaksa-app-icon-192.png",
  512: "/brand/barndaksa-app-icon-512.png",
} as const;
const FALLBACK_MASKABLE_ICONS = {
  192: "/brand/barndaksa-app-icon-192.png",
  512: "/brand/barndaksa-maskable-icon-512.png",
} as const;

function normalizeIconSize(value: string | null) {
  return value === "512" ? 512 : 192;
}

function normalizeIconPurpose(value: string | null) {
  return value === "maskable" ? "maskable" : "any";
}

function fallbackIcon(size: 192 | 512, purpose: "any" | "maskable") {
  if (purpose === "maskable") return FALLBACK_MASKABLE_ICONS[size];
  return FALLBACK_ANY_ICONS[size];
}

function dataImageResponse(dataUrl: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  try {
    const body = Uint8Array.from(Buffer.from(match[2], "base64"));
    return new Response(body, {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": publicCacheHeader(ICON_TTL_SECONDS),
        "x-barndaksa-cafe-favicon": "cached-v5",
        "x-barndaksa-cafe-favicon-source": "brand",
      },
    });
  } catch {
    return null;
  }
}

async function loadCafeIconUrl(slug: string) {
  const [settings, identity] = await Promise.all([
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  return getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const requestUrl = new URL(request.url);
  const version = requestUrl.searchParams.get("v")?.slice(0, 160) || "default";
  const size = normalizeIconSize(requestUrl.searchParams.get("size"));
  const purpose = normalizeIconPurpose(requestUrl.searchParams.get("purpose"));

  const iconUrl = await cachedServerValue(
    `public-cafe-favicon:${normalizedSlug}:${version}:${size}:${purpose}`,
    ICON_TTL_SECONDS * 1000,
    () => loadCafeIconUrl(normalizedSlug),
  ).catch((error) => {
    console.warn("[public/cafe/favicon/fallback]", error);
    return null;
  });
  const brandIconUrl =
    iconUrl && !isDefaultBarndaksaCafeLogo(iconUrl) ? iconUrl : null;

  if (brandIconUrl?.startsWith("data:image/")) {
    const response = dataImageResponse(brandIconUrl);
    if (response) return response;
  }

  const redirectUrl = new URL(brandIconUrl ?? fallbackIcon(size, purpose), request.url);
  const response = NextResponse.redirect(redirectUrl, 307);
  response.headers.set("Cache-Control", publicCacheHeader(ICON_TTL_SECONDS));
  response.headers.set("x-barndaksa-cafe-favicon", "cached-v5");
  response.headers.set("x-barndaksa-cafe-favicon-source", brandIconUrl ? "brand" : "fallback");
  return response;
}
