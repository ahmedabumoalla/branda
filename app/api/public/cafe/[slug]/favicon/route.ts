import {
  getPreferredCafeDisplayLogoUrl,
  isDefaultBarndaksaCafeLogo,
} from "@/lib/cafe/cafe-display-logo";
import { getCafeBySlug } from "@/lib/data/cafes";
import { getPublicCafeSettings } from "@/lib/data/settings";
import { getPublicCustomIdentity } from "@/lib/data/theme";
import { publicCacheHeader } from "@/lib/performance/server-cache";
import { cachedServerValue } from "@/lib/performance/server-memory-cache";

type Props = {
  params: Promise<{ slug: string }>;
};

type IconMeta = {
  name: string;
  iconUrl: string | null;
};

export const runtime = "nodejs";

const ICON_TTL_SECONDS = 10 * 60;

function normalizeIconSize(value: string | null) {
  return value === "512" ? 512 : 192;
}

function normalizeIconPurpose(value: string | null) {
  return value === "maskable" ? "maskable" : "any";
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function initials(name: string) {
  const normalized = name.replace(/[\u064B-\u065F\u0670]/g, "").trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[1]] : [normalized];
  const text = letters
    .map((part) => Array.from(part)[0])
    .filter(Boolean)
    .join("");

  return text || "ب";
}

function parseDataImage(dataUrl: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;
  return { contentType: match[1], base64: match[2] };
}

async function imageToDataUrl(source: string | null, requestUrl: string) {
  if (!source) return null;

  const dataImage = parseDataImage(source);
  if (dataImage) return `data:${dataImage.contentType};base64,${dataImage.base64}`;

  const response = await fetch(new URL(source, requestUrl), { cache: "no-store" });
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function baseSvgHeaders(source: "brand" | "generated") {
  return {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": publicCacheHeader(ICON_TTL_SECONDS),
    "x-barndaksa-cafe-favicon": "always-load-svg-v1",
    "x-barndaksa-cafe-favicon-source": source,
  };
}

function brandImageSvg(dataUrl: string, size: 192 | 512, purpose: "any" | "maskable") {
  const padding = purpose === "maskable" ? Math.round(size * 0.14) : 0;
  const imageSize = size - padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}px" height="${size}px" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#F8F4EF"/><image href="${dataUrl}" x="${padding}" y="${padding}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

function generatedBrandSvg(name: string, size: 192 | 512, purpose: "any" | "maskable") {
  const padding = purpose === "maskable" ? Math.round(size * 0.14) : 0;
  const safe = Math.max(0, size - padding * 2);
  const cx = padding + safe / 2;
  const cy = padding + safe / 2;
  const radius = safe / 2;
  const text = escapeXml(initials(name));
  const fontSize = Math.round(size * 0.34);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}px" height="${size}px" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#F8F4EF"/><circle cx="${cx}" cy="${cy}" r="${radius}" fill="#652117"/><text x="${cx}" y="${cy}" fill="#FBCF72" text-anchor="middle" dominant-baseline="central" font-family="Arial,Tahoma,sans-serif" font-size="${fontSize}" font-weight="900">${text}</text></svg>`;
}

async function loadCafeIconMeta(slug: string): Promise<IconMeta> {
  const [cafe, settings, identity] = await Promise.all([
    getCafeBySlug(slug).catch(() => null),
    getPublicCafeSettings(slug).catch(() => null),
    getPublicCustomIdentity(slug).catch(() => null),
  ]);

  const iconUrl = getPreferredCafeDisplayLogoUrl(
    settings?.logoDataUrl,
    identity?.legacyLogoDataUrl,
  );

  return {
    name: settings?.cafeName || cafe?.name || "برندة",
    iconUrl: iconUrl && !isDefaultBarndaksaCafeLogo(iconUrl) ? iconUrl : null,
  };
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.trim().toLowerCase();
  const requestUrl = new URL(request.url);
  const version = requestUrl.searchParams.get("v")?.slice(0, 160) || "default";
  const size = normalizeIconSize(requestUrl.searchParams.get("size"));
  const purpose = normalizeIconPurpose(requestUrl.searchParams.get("purpose"));

  const meta = await cachedServerValue(
    `public-cafe-favicon:${normalizedSlug}:${version}:${size}:${purpose}`,
    ICON_TTL_SECONDS * 1000,
    () => loadCafeIconMeta(normalizedSlug),
  ).catch((error) => {
    console.warn("[public/cafe/favicon/generated]", error);
    return { name: normalizedSlug, iconUrl: null } satisfies IconMeta;
  });

  const brandDataUrl = await imageToDataUrl(meta.iconUrl, request.url).catch(() => null);

  if (brandDataUrl) {
    return new Response(brandImageSvg(brandDataUrl, size, purpose), {
      headers: baseSvgHeaders("brand"),
    });
  }

  return new Response(generatedBrandSvg(meta.name, size, purpose), {
    headers: baseSvgHeaders("generated"),
  });
}
