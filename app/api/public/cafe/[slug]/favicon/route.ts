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

export const runtime = "nodejs";

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

function parseDataImage(dataUrl: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1], base64: match[2] };
}

async function imageToDataUrl(source: string, requestUrl: string) {
  const dataImage = parseDataImage(source);
  if (dataImage) return `data:${dataImage.contentType};base64,${dataImage.base64}`;

  const response = await fetch(new URL(source, requestUrl), { cache: "no-store" });
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function svgIconResponse(dataUrl: string, size: 192 | 512, purpose: "any" | "maskable", source: "brand" | "fallback") {
  const padding = purpose === "maskable" ? Math.round(size * 0.14) : 0;
  const imageSize = size - padding * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}px" height="${size}px" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#F8F4EF"/><image href="${dataUrl}" x="${padding}" y="${padding}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet"/></svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": publicCacheHeader(ICON_TTL_SECONDS),
      "x-barndaksa-cafe-favicon": "sized-svg-v1",
      "x-barndaksa-cafe-favicon-source": source,
    },
  });
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
  const primarySource = brandIconUrl ?? fallbackIcon(size, purpose);
  const primaryDataUrl = await imageToDataUrl(primarySource, request.url).catch(() => null);

  if (primaryDataUrl) {
    return svgIconResponse(primaryDataUrl, size, purpose, brandIconUrl ? "brand" : "fallback");
  }

  const fallbackDataUrl = await imageToDataUrl(fallbackIcon(size, purpose), request.url).catch(() => null);
  if (fallbackDataUrl) {
    return svgIconResponse(fallbackDataUrl, size, purpose, "fallback");
  }

  return new Response("Icon not available", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "x-barndaksa-cafe-favicon": "missing",
    },
  });
}
